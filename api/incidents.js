/**
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

function verifyToken(token, secret) {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return false;

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');

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
  try { return JSON.parse(x); } catch (e) { return null; }
}

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
    audit_hash: hash,
    raw: s
  };
}

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
      .update(JSON.stringify({ submission: submission, aiAnalysis: aiAnalysis, submittedAt: submittedAt }))
      .digest('hex');

    const row = toRegisterRow(id, submission, aiAnalysis, submittedAt, hash);

    await kv.lpush('submissions', JSON.stringify(row));
    await kv.set('submission:' + row.ref_id, JSON.stringify(row));

    const auditId = await kv.incr('audit:seq');
    const auditEntry = {
      id: auditId,
      submission_ref: row.ref_id,
      timestamp: submittedAt,
      action: 'created',
      actor: actor,
      field: '-',
      old_value: '',
      new_value: 'submitted'
    };
    await kv.lpush('audit_trail', JSON.stringify(auditEntry));

    return res.status(200).json({
      success: true,
      id: id,
      ref_id: row.ref_id,
      submitted_at: submittedAt,
      audit_hash: hash
    });
  } catch (err) {
    console.error('POST /api/incidents error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to persist submission',
      detail: (err && err.message) ? err.message : String(err)
    });
  }
}

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
      return res.status(200).json({ success: true, submission: record });
    }

    const subsRaw = await kv.lrange('submissions', 0, limit - 1);
    let submissions = (subsRaw || []).map(safeParse).filter(Boolean);

    if (moduleFilter) {
      submissions = submissions.filter(function (s) { return s.module === moduleFilter; });
    }

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
      returned: listSubmissions.length
    });
  } catch (err) {
    console.error('GET /api/incidents error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch submissions',
      detail: (err && err.message) ? err.message : String(err)
    });
  }
}

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');

  // DEBUG endpoint — no auth required, returns env-check only
  try {
    const host = req.headers.host || 'localhost';
    const debugUrl = new URL(req.url, 'http://' + host);
    if (debugUrl.searchParams.get('debug') === '1') {
      const authSecret = process.env.INCIDENT_AUTH_SECRET || '';
      return res.status(200).json({
        debug: true,
        env_check: {
          INCIDENT_AUTH_SECRET_present: authSecret.length > 0,
          INCIDENT_AUTH_SECRET_length: authSecret.length,
          KV_REST_API_URL_present: !!process.env.KV_REST_API_URL,
          KV_REST_API_TOKEN_present: !!process.env.KV_REST_API_TOKEN,
          NODE_ENV: process.env.NODE_ENV || 'unset'
        },
        request_check: {
          method: req.method,
          has_auth_header: !!req.headers.authorization,
          auth_starts_with_bearer: !!(req.headers.authorization && req.headers.authorization.startsWith('Bearer ')),
          token_length: req.headers.authorization ? req.headers.authorization.slice(7).length : 0
        }
      });
    }
  } catch (e) {
    // Fall through to normal handling
  }

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