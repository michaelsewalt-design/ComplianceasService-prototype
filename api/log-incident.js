/**
 * POST /api/log-incident
 * Body: { submission: {...}, aiAnalysis: "..." }
 * Auth: Bearer token (same pattern as incident-review.js)
 *
 * Appends a new submission to the compliance register (Vercel KV list)
 * and writes an audit_trail entry.
 *
 * ENV required:
 *   INCIDENT_AUTH_SECRET      — shared HMAC secret for token verification
 *   KV_REST_API_URL           — auto-injected by Vercel KV integration
 *   KV_REST_API_TOKEN         — auto-injected by Vercel KV integration
 */
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const kv = Redis.fromEnv();

/* ── Token verification (same signature as incident-review.js) ── */
function verifyToken(token, secret) {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
    // Constant-time compare
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/* ── Map raw submission → register row (matches xlsx template columns) ── */
function toRegisterRow(id, submission, aiAnalysis, submittedAt, hash) {
  const s = submission || {};
  const subjectType =
    s.incType   || s.aprType  ||
    s.discType  || s.qryTopic || '';

  const eventDate =
    s.incDate || s.discDate || '';

  const deadline =
    s.aprDeadline || s.qryDeadline || '';

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
    subject_type: subjectType,
    event_date: eventDate,
    discovered_date: s.incDiscov || '',
    deadline: deadline,
    affected_parties: s.incParties || '',
    description:
      s.incDesc || s.aprDesc || s.discDesc || s.qryDesc || '',
    actions_taken: s.incActions || '',
    financial_impact_eur:
      Number(s.incImpact || s.discValue || 0) || 0,
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
    // Keep raw payload for later replay / detail view
    raw: s,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // ── Auth ──────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const authSecret = process.env.INCIDENT_AUTH_SECRET;
  if (!authSecret || !verifyToken(token, authSecret)) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // ── Extract token subject (email) for audit actor ──
  let actorEmail = 'unknown';
  try {
    const decoded = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64').toString('utf8')
    );
    actorEmail = decoded.email || decoded.sub || 'unknown';
  } catch { /* ignore */ }

  // ── Parse body ────────────────────────────────────────────────
  const { submission, aiAnalysis } = req.body || {};
  if (!submission || typeof submission !== 'object') {
    return res.status(400).json({ success: false, error: 'submission is required' });
  }
  if (!submission.ref) {
    return res.status(400).json({ success: false, error: 'submission.ref is required' });
  }

  try {
    // ── Assign id + hash ───────────────────────────────────────
    const id = await kv.incr('submissions:seq');
    const submittedAt = new Date().toISOString();
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ submission, aiAnalysis, submittedAt }))
      .digest('hex');

    const row = toRegisterRow(id, submission, aiAnalysis, submittedAt, hash);

    // ── Persist ────────────────────────────────────────────────
    // Main list (newest first via lpush)
    await kv.lpush('submissions', JSON.stringify(row));
    // Also keyed lookup for detail view: submission:<ref_id>
    await kv.set(`submission:${row.ref_id}`, JSON.stringify(row));

    // ── Audit trail entry ──────────────────────────────────────
    const auditId = await kv.incr('audit:seq');
    const auditEntry = {
      id: auditId,
      submission_ref: row.ref_id,
      timestamp: submittedAt,
      action: 'created',
      actor: actorEmail,
      field: '-',
      old_value: '',
      new_value: 'submitted',
    };
    await kv.lpush('audit_trail', JSON.stringify(auditEntry));

    return res.status(200).json({
      success: true,
      id,
      ref_id: row.ref_id,
      submitted_at: submittedAt,
      audit_hash: hash,
    });
  } catch (err) {
    console.error('log-incident error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to persist submission',
      detail: err && err.message ? err.message : String(err),
    });
  }
};
