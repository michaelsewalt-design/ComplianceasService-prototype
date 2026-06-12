const crypto = require('crypto');

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [hmacHex, ts] = parts;
  const timestamp = parseInt(ts, 10);
  if (isNaN(timestamp)) return false;
  if (Date.now() - timestamp > TOKEN_MAX_AGE_MS) return false;
  const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHex, 'hex'), Buffer.from(expected, 'hex'));
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  /* CORS headers */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── Auth check ── */
  const authSecret = process.env.SCREENING_AUTH_SECRET;
  if (authSecret) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!verifyToken(token, authSecret)) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
  }

  /* ── API key ── */
  const apiKey = process.env.SCREENING_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'SCREENING_ANTHROPIC_API_KEY is not configured.' });
  }

  try {
    const payload = req.body;

    const systemPrompt = [
      'You are an AML/KYC screening assistant.',
      'Return valid JSON only (no markdown fences, no commentary) with the following keys:',
      '  basicCompanyInfo  - object with: companyName, registrationNumber, country, website, industry, uboInfo (array of {name, ownership, country}), overview (string)',
      '  adverseMediaFound - array of strings',
      '  companyAnalysis   - string',
      '  amlRisks          - array of strings',
      '  shortSummary      - string',
      '  riskRating        - "HIGH", "MEDIUM", or "LOW"',
      'Base your analysis on publicly known information. Be concise and professional.'
    ].join('\n');

    const userPrompt = 'Screen the following corporate profile for adverse media and open-source sanctions concerns. Return concise professional findings.\n\n' + JSON.stringify(payload, null, 2);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', errText);
      return res.status(response.status).json({ error: 'Claude API error', details: errText });
    }

    const data = await response.json();

    /* Extract text content from Claude response */
    const textContent = Array.isArray(data.content)
      ? data.content.map(function(part) { return part.text || ''; }).join('\n')
      : '';

    /* Strip potential markdown fences */
    var cleaned = textContent.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Screening API error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
