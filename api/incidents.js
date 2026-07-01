"""
Regenerate api/incidents.js — clean, complete, tested syntax.
Run: python generate_incidents.py
Output: incidents.js in current directory. Move to api/ folder.
"""

INCIDENTS_JS = r'''/**
 * /api/incidents — CONSOLIDATED endpoint
 *   POST /api/incidents         → log new submission
 *   GET  /api/incidents         → fetch submissions + audit
 *   GET  /api/incidents?ref=X   → fetch single submission
 *
 * Auth: Bearer token (INCIDENT_AUTH_SECRET)
 * Storage: Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN)
 */
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const kv = Redis.fromEnv();

/* ── Auth helpers ── */
function verifyToken(token, secret) {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function extractActor(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('utf8'));
    return decoded.email || decoded.sub || 'unknown';
  } catch { return 'unknown'; }
}

function safeParse(x) {
  if (x == null) return null;
  if (typeof x === 'object') return x;
  try { return JSON.parse(x); } catch { return null; }
}

/* ── Field mapping ── */
function toRegisterRow(id, submission, aiAnalysis, submittedAt, hash) {
  const s = submission || {};
  return {
    id,
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
    legal_consulted: !!s.aprLegal,
    attachments_count: Array.isArray(s.files) ? s.files.length : 0,
    attachments_list: Array.isArray(s.files) ? s.files.join('; ') : '',
    ai_analysis: aiAnalysis || '',
    ai_recommended_severity: '',
    assigned_to: '',
    resolution_notes: '',
    resolved_at: '',
    audit_hash: hash,
    raw: s,
  };
}

/* ── POST handler: log a new submission ── */
async function handlePost(req, res, actor) {
  const body = req.body || {};
  const { submission, aiAnalysis } = body;

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

    // Persist: list (newest first) + keyed lookup
    await kv.lpush('submissions', JSON.stringify(row));
    await kv.set('submission:' + row.ref_id, JSON.stringify(row));

    // Audit trail entry
    const auditId = await kv.incr('audit:seq');
    const auditEntry = {
      id: auditId,
      submission_ref: row.ref_id,
      timestamp: submittedAt,
      action: 'created',
      actor: actor,
      field: '-',
      old_value: '',
      new_value: 'submitted',
    };
    await kv.lpush('audit_trail', JSON.stringify(auditEntry));

    return res.status(200).json({
      success: true,
      id: id,
      ref_id: row.ref_id,
      submitted_at: submittedAt,
      audit_hash: hash,
    });
  } catch (err) {
    console.error('POST /api/incidents error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to persist submission',
      detail: (err && err.message) ? err.message : String(err),
    });
  }
}

/* ── GET handler: fetch submissions or single record ── */
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
    // Single-record fast path
    if (ref) {
      const raw = await kv.get('submission:' + ref);
      const record = safeParse(raw);
      if (!record) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }
      return res.status(200).json({ success: true, submission: record });
    }

    // Bulk fetch (newest first because we use lpush)
    const subsRaw = await kv.lrange('submissions', 0, limit - 1);
    let submissions = (subsRaw || []).map(safeParse).filter(Boolean);

    if (moduleFilter) {
      submissions = submissions.filter(function (s) { return s.module === moduleFilter; });
    }

    // Strip heavy raw payload from list view
    const listSubmissions = submissions.map(function (s) {
      const copy = Object.assign({}, s);
      delete copy.raw;
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
      returned: listSubmissions.length,
    });
  } catch (err) {
    console.error('GET /api/incidents error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch submissions',
      detail: (err && err.message) ? err.message : String(err),
    });
  }
}

/* ── Main handler ── */
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Auth check (both methods need it)
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

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
'''

import os
with open('incidents.js', 'w', encoding='utf-8') as f:
    f.write(INCIDENTS_JS)
print('Written incidents.js — {:,} bytes'.format(os.path.getsize('incidents.js')))
print('Move it to api/incidents.js (overwrite existing).')