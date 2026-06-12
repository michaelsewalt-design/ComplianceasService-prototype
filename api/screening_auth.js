const crypto = require('crypto');

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function makeToken(secret) {
  const ts = String(Date.now());
  const hmac = crypto.createHmac('sha256', secret).update(ts).digest('hex');
  return hmac + '.' + ts;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [hmacHex, ts] = parts;
  const timestamp = parseInt(ts, 10);
  if (isNaN(timestamp)) return false;

  // Check expiry
  if (Date.now() - timestamp > TOKEN_MAX_AGE_MS) return false;

  // Verify HMAC
  const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHex, 'hex'), Buffer.from(expected, 'hex'));
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sitePassword = process.env.SCREENING_SITE_PASSWORD;
  const authSecret = process.env.SCREENING_AUTH_SECRET;

  if (!sitePassword || !authSecret) {
    return res.status(500).json({ success: false, message: 'Authentication is not configured.' });
  }

  /* ── POST: Login ── */
  if (req.method === 'POST') {
    const { password } = req.body || {};

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    // Constant-time comparison
    const pwBuf = Buffer.from(password);
    const expectedBuf = Buffer.from(sitePassword);
    const match = pwBuf.length === expectedBuf.length && crypto.timingSafeEqual(pwBuf, expectedBuf);

    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid password.' });
    }

    const token = makeToken(authSecret);
    return res.status(200).json({ success: true, token });
  }

  /* ── GET: Verify token ── */
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (verifyToken(token, authSecret)) {
      return res.status(200).json({ valid: true });
    }
    return res.status(401).json({ valid: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
