/**
 * /api/incidents — Compliance incident register
 *   POST   /api/incidents           → log new submission
 *   GET    /api/incidents           → fetch submissions + audit
 *   GET    /api/incidents?ref=X     → fetch single submission
 *   PUT    /api/incidents?ref=X     → update status/assignment/notes (audit-logged)
 *
 * Auth: Bearer token (INCIDENT_AUTH_SECRET, base64url HMAC)
 * Storage: Upstash Redis
 */
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const kv = Redis.fromEnv();

/* ── Auth ── */
function verifyToken(token, secret) {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return false;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (signature !== expectedSig) return false;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Date.now()) return false;
    return payload.authenticated === true;
  } catch {
    return false;
  }
}

function extractActor(token) {
  try {
    const data = token.split('.')[0];
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.email || payload.sub || payload.user || 'authenticated-user';
  } catch {
    return 'unknown';
  }
}

function safeParse(x) {
  if (x == null) return null;
  if (typeof x === 'object') return x;
  try { return JSON.parse(x); } catch { return null; }
}

/* ── Field mapping (unchanged from working version) ── */
function toRegisterRow(id, submission, aiAnalysis, submittedAt, hash) {
  const s = submission || {};
  return {
    id: id,
    ref_id: s.ref || '',
    submitted_at: submittedAt,
    module: s.module || '',
    status: 'New',
    severity: s.severity || '',
    priority: s.priority || '',
    requester_name: s.name || '',
    requester_email: s.email || '',
    department: s.dept || '',
    manager: s.manager || '',
    subject_type: s.incType || s.aprType || s.discType || s.qryTopic || '',
    event_date: s.incDate || s.discDate || '',
    discovered_date: s.incDiscov || '',
    deadline: s.aprDeadline || s.qryDeadline || '',
    affected_parties: s.incParties || '',
    description: s.incDesc || s.aprDesc || s.discDesc || s.qryDesc || '',
    actions_taken: s.incActions || '',
    financial_impact_eur: Number(s.incImpact || s.discValue || 0) || 0,
    regulatory_reporting: s.incReporting || '',
    legal_consulted: s.aprLegal === true,
    attachments_count: Array.isArray(s.files) ? s.files.length : 0,
    attachments_list: Array.isArray(s.files) ? s.files.join('; ') : '',
    ai_analysis: aiAnalysis || '',
    ai_recommended_severity: '',
    assigned_to: '',
    resolution_notes: '',
    resolved_at: '',
    reported_to: [],
    reported_at: '',
    regulator_references: '',
    audit_hash: hash,
    raw: s
  };
}

/* ── Audit trail helper ── */
async function writeAudit(submissionRef, action, actor, field, oldValue, newValue) {
  const auditId = await kv.incr('audit:seq');
  const entry = {
    id: auditId,
    submission_ref: submissionRef,
    timestamp: new Date().toISOString(),
    action: action,
    actor: actor,
    field: field || '-',
    old_value: oldValue == null ? '' : String(oldValue),
    new_value: newValue == null ? '' : String(newValue)
  };
  await kv.lpush('audit_trail', JSON.stringify(entry));
  return entry;
}

/* ── POST: log new submission ── */
async function handlePost(req, res, actor) {
  const body = req.body || {};
  const submission = body.submission;
  const aiAnalysis = body.aiAnalysis;

  if (!submission || typeof submission !== 'object') {
    return res.status(400).json({ success: false, error: 'submission is required' });
  }
  if (!submission.ref) {
    return res.status(400).json({ success: false, error: 'submission.ref is required' });
  }

  try {
    const id = await kv.incr('submissions:seq');
    const submittedAt = new Date().toISOString();
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ submission, aiAnalysis, submittedAt }))
      .digest('hex');

    const row = toRegisterRow(id, submission, aiAnalysis, submittedAt, hash);

    await kv.lpush('submissions', JSON.stringify(row));
    await kv.set('submission:' + row.ref_id, JSON.stringify(row));
    await writeAudit(row.ref_id, 'created', actor, '-', '', 'submitted');

    return res.status(200).json({
      success: true,
      id: id,
      ref_id: row.ref_id,
      submitted_at: submittedAt,
      audit_hash: hash
    });
  } catch (err) {
    console.error('POST error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to persist submission',
      detail: (err && err.message) ? err.message : String(err)
    });
  }
}

/* ── GET: list all or single record ── */
async function handleGet(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, 'http://' + host);
  const ref = url.searchParams.get('ref');
  const moduleFilter = url.searchParams.get('module');
  let limit = parseInt(url.searchParams.get('limit') || '200', 10);
  if (isNaN(limit) || limit <= 0) limit = 200;
  if (limit > 1000) limit = 1000;

  try {
    if (ref) {
      const raw = await kv.get('submission:' + ref);
      const record = safeParse(raw);
      if (!record) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }
      // Also include audit trail specific to this ref
      const auditRaw = await kv.lrange('audit_trail', 0, 999);
      const audit = (auditRaw || [])
        .map(safeParse)
        .filter(Boolean)
        .filter(function (a) { return a.submission_ref === ref; });
      return res.status(200).json({ success: true, submission: record, audit: audit });
    }

    const subsRaw = await kv.lrange('submissions', 0, limit - 1);
    let submissions = (subsRaw || []).map(safeParse).filter(Boolean);
    if (moduleFilter) {
      submissions = submissions.filter(function (s) { return s.module === moduleFilter; });
    }
    const listSubmissions = submissions.map(function (s) {
      const copy = Object.assign({}, s);
      delete copy.raw;
      delete copy.ai_analysis; // strip heavy field from list view
      return copy;
    });

    const auditRaw = await kv.lrange('audit_trail', 0, 99);
    const audit = (auditRaw || []).map(safeParse).filter(Boolean);
    const total = await kv.llen('submissions');

    return res.status(200).json({
      success: true,
      submissions: listSubmissions,
      audit: audit,
      total: total,
      returned: listSubmissions.length
    });
  } catch (err) {
    console.error('GET error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch submissions',
      detail: (err && err.message) ? err.message : String(err)
    });
  }
}

/* ── PUT: update status/assignment/notes ── */
async function handlePut(req, res, actor) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, 'http://' + host);
  const ref = url.searchParams.get('ref');

  if (!ref) {
    return res.status(400).json({ success: false, error: 'ref query param is required' });
  }

  const body = req.body || {};
 const allowed = ['status', 'assigned_to', 'resolution_notes', 'severity', 'reported_to', 'regulator_references'];
  const updates = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No updatable fields provided' });
  }

  try {
    const raw = await kv.get('submission:' + ref);
    const record = safeParse(raw);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // Build updated record and track changes for audit
    const changes = [];
    for (const key of Object.keys(updates)) {
      const oldVal = record[key];
      const newVal = updates[key];
      if (oldVal !== newVal) {
        changes.push({ field: key, from: oldVal, to: newVal });
        record[key] = newVal;
      }
    }

    if (changes.length === 0) {
      return res.status(200).json({ success: true, submission: record, changes: [] });
    }

    // Auto-fill resolved_at when status → Resolved
    if (updates.status === 'Resolved' && !record.resolved_at) {
      record.resolved_at = new Date().toISOString();
      changes.push({ field: 'resolved_at', from: '', to: record.resolved_at });
    }

// Auto-fill reported_at when status → Reported
    if (updates.status === 'Reported' && !record.reported_at) {
      record.reported_at = new Date().toISOString();
      changes.push({ field: 'reported_at', from: '', to: record.reported_at });
    }

    // Persist updated record (key lookup)
    await kv.set('submission:' + ref, JSON.stringify(record));

    // NOTE: the 'submissions' list contains a snapshot at submit time.
    // For dashboard consistency we also refresh the list entry by
    // rebuilding it. Since Redis lists don't support in-place update
    // efficiently, we rewrite the whole list.
    await refreshListEntry(ref, record);

    // Write one audit entry per changed field
    const auditEntries = [];
    for (const change of changes) {
      const entry = await writeAudit(ref, 'updated', actor, change.field, change.from, change.to);
      auditEntries.push(entry);
    }

    return res.status(200).json({
      success: true,
      submission: record,
      changes: changes,
      audit_entries: auditEntries
    });
  } catch (err) {
    console.error('PUT error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update submission',
      detail: (err && err.message) ? err.message : String(err)
    });
  }
}

/* ── Helper: refresh a single entry in the 'submissions' list ── */
async function refreshListEntry(ref, updatedRecord) {
  const all = await kv.lrange('submissions', 0, -1);
  const parsed = (all || []).map(safeParse).filter(Boolean);
  const idx = parsed.findIndex(function (s) { return s.ref_id === ref; });
  if (idx === -1) return;
  parsed[idx] = updatedRecord;
  // Rewrite the entire list. For low-volume compliance data this is fine.
  await kv.del('submissions');
  if (parsed.length > 0) {
    // lpush in reverse order to preserve original ordering
    for (let i = parsed.length - 1; i >= 0; i--) {
      await kv.lpush('submissions', JSON.stringify(parsed[i]));
    }
  }
}

/* ── Main handler ── */
module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const authSecret = process.env.INCIDENT_AUTH_SECRET;
  if (!authSecret || !verifyToken(token, authSecret)) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  const actor = extractActor(token);

  if (req.method === 'POST') return handlePost(req, res, actor);
  if (req.method === 'GET')  return handleGet(req, res);
  if (req.method === 'PUT')  return handlePut(req, res, actor);

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};