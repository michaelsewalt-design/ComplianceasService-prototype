/**
 * GET /api/get-incidents
 * Auth: Bearer token (same pattern as incident-review.js)
 *
 * Query params (optional):
 *   ?limit=100        — max submissions to return (default 200, hard cap 1000)
 *   ?module=incident  — filter by module server-side
 *   ?ref=REF-...      — return only that single submission (uses key lookup)
 *
 * Response:
 *   { success: true, submissions: [...], audit: [...], total: N }
 *
 * ENV required:
 *   INCIDENT_AUTH_SECRET
 *   KV_REST_API_URL, KV_REST_API_TOKEN (auto-injected by Vercel KV)
 */
const crypto = require('crypto');
const { kv } = require('@vercel/kv');

function verifyToken(token, secret) {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function safeParse(x) {
  if (x == null) return null;
  if (typeof x === 'object') return x;   // KV may already return objects
  try { return JSON.parse(x); } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
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

  // ── Query params ─────────────────────────────────────────────
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ref = url.searchParams.get('ref');
  const moduleFilter = url.searchParams.get('module');
  let limit = parseInt(url.searchParams.get('limit') || '200', 10);
  if (isNaN(limit) || limit <= 0) limit = 200;
  if (limit > 1000) limit = 1000;

  try {
    // ── Single-record fast path ────────────────────────────────
    if (ref) {
      const raw = await kv.get(`submission:${ref}`);
      const record = safeParse(raw);
      if (!record) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }
      return res.status(200).json({ success: true, submission: record });
    }

    // ── Bulk fetch ─────────────────────────────────────────────
    // Submissions were lpush'd -> index 0 = newest
    const subsRaw = await kv.lrange('submissions', 0, limit - 1);
    let submissions = (subsRaw || [])
      .map(safeParse)
      .filter(Boolean);

    if (moduleFilter) {
      submissions = submissions.filter(s => s.module === moduleFilter);
    }

    // Strip heavy `raw` field for list view to keep payload small
    const listSubmissions = submissions.map(s => {
      const { raw, ...rest } = s;
      return rest;
    });

    // Audit: last 100 events
    const auditRaw = await kv.lrange('audit_trail', 0, 99);
    const audit = (auditRaw || [])
      .map(safeParse)
      .filter(Boolean);

    // Total count (all submissions ever, not just page)
    const total = await kv.llen('submissions');

    return res.status(200).json({
      success: true,
      submissions: listSubmissions,
      audit,
      total,
      returned: listSubmissions.length,
    });
  } catch (err) {
    console.error('get-incidents error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch submissions',
      detail: err && err.message ? err.message : String(err),
    });
  }
};
