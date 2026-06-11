module.exports = async (req, res) => {
res.setHeader('Content-Type', 'application/json');

if (req.method !== 'POST') {
return res.status(405).json({ error: 'Method not allowed' });
}

// Verify auth token
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
return res.status(401).json({ error: 'Unauthorized' });
}

const token = authHeader.slice(7);
try {
const [data, signature] = token.split('.');
const crypto = require('crypto');
const expectedSig = crypto
.createHmac('sha256', process.env.AUTH_SECRET)
.update(data)
.digest('base64url');

if (signature !== expectedSig) {
return res.status(401).json({ error: 'Invalid token' });
}

const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
if (payload.exp < Date.now()) {
return res.status(401).json({ error: 'Token expired' });
}
} catch {
return res.status(401).json({ error: 'Invalid token' });
}

// Proxy request to Anthropic
const { messages, system, max_tokens, model } = req.body || {};

if (!messages || !Array.isArray(messages)) {
return res.status(400).json({ error: 'Messages array is required' });
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
console.error('ANTHROPIC_API_KEY not configured');
return res.status(500).json({ error: 'Server configuration error' });
}

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: max_tokens || 1024,
      system: system || '',
      messages
    }),
    signal: controller.signal
  });

  clearTimeout(timeout);

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.text();
    console.error('Anthropic API error:', anthropicRes.status, errBody);
    return res.status(anthropicRes.status).json({
      error: `Anthropic API error: ${anthropicRes.status}`,
      details: errBody
    });
  }

  const result = await anthropicRes.json();
  return res.status(200).json(result);

} catch (err) {
  if (err.name === 'AbortError') {
    console.error('Anthropic API timeout');
    return res.status(504).json({ error: 'AI service timed out' });
  }

  console.error('Proxy error:', err);
  return res.status(500).json({ error: 'Failed to reach AI service' });
}
};