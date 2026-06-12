const crypto = require('crypto');

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

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── Auth check ── */
  const authSecret = process.env.SCREENING_AUTH_SECRET;
  if (authSecret) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }
    const token = authHeader.slice(7);
    if (!verifyToken(token, authSecret)) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
  }

  /* ── API key ── */
  const apiKey = process.env.SCREENING_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('SCREENING_ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const { question, report, chatHistory } = req.body || {};

    if (!question || !report) {
      return res.status(400).json({ error: 'Question and report data are required.' });
    }

    const systemPrompt =
      'You are an AML/KYC screening assistant. You have previously generated a screening report for a company. ' +
      'The user is now asking follow-up questions about the report. Answer concisely and professionally based on ' +
      'the report data and your knowledge. Respond in plain text, not JSON.';

    /* Build message history */
    const messages = [];

    /* First: provide the report as context */
    messages.push({
      role: 'user',
      content: 'Here is the screening report I generated:\n\n' + JSON.stringify(report, null, 2) + '\n\nPlease answer my follow-up questions about this report.'
    });
    messages.push({
      role: 'assistant',
      content: 'I have reviewed the screening report. Please ask your follow-up questions and I will answer based on the report data and my knowledge.'
    });

    /* Append previous chat turns */
    if (Array.isArray(chatHistory)) {
      chatHistory.forEach(function(msg) {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    /* Append the new question */
    messages.push({ role: 'user', content: question });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', errText);
      return res.status(response.status).json({ error: 'Claude API error', details: errText });
    }

    const data = await response.json();

    const answer = Array.isArray(data.content)
      ? data.content.map(function(part) { return part.text || ''; }).join('\n')
      : '';

    return res.status(200).json({ answer: answer.trim() });

  } catch (error) {
    console.error('Screening chat error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};