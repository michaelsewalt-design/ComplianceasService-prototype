const https = require('https');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Content-Type', 'application/json');
res.setHeader('Access-Control-Allow-Origin', 'https://complianceas-service-prototype.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.VENDOR_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('VENDOR_ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error: API key not set.' });
  }

  try {
    const { messages, maxTokens } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing or invalid messages array.' });
    }

    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 8000,
      messages: messages
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const apiResponse = await new Promise((resolve, reject) => {
      const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => { data += chunk; });
        apiRes.on('end', () => {
          resolve({ statusCode: apiRes.statusCode, body: data });
        });
      });
      apiReq.on('error', reject);
      apiReq.write(payload);
      apiReq.end();
    });

    if (apiResponse.statusCode !== 200) {
      let errBody;
      try { errBody = JSON.parse(apiResponse.body); } catch(e) { errBody = { error: apiResponse.body }; }
      return res.status(apiResponse.statusCode).json({ error: errBody.error?.message || 'Claude API error', details: errBody });
    }

    const result = JSON.parse(apiResponse.body);
    return res.status(200).json(result);

  } catch (err) {
    console.error('vendor-claude error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
