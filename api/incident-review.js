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

  // Verify Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const authSecret = process.env.INCIDENT_AUTH_SECRET;
  if (!authSecret || !verifyToken(token, authSecret)) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // Parse request body
  const { formData, module } = req.body || {};
  if (!formData) {
    return res.status(400).json({ success: false, error: 'formData is required' });
  }

  const apiKey = process.env.INCIDENT_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'API key not configured' });
  }

  // Build system prompt based on module type
  const formDataStr = JSON.stringify(formData, null, 2);

  const prompts = {
    incident: `You are a senior compliance officer at a regulated financial institution.
A staff member has submitted an incident report. Review the submission and provide:
1. A concise executive summary (2-3 sentences)
2. Regulatory risk assessment: which regulations may be implicated (e.g. AMLR, MAR, GDPR, Wwft)?
3. Key flags or concerns you have identified
4. Recommended immediate actions (if any)
5. External reporting obligations to consider (AFM, DNB, FIU-NL, EBA)

Be professional, specific, and concise. Use bullet points where appropriate.

SUBMISSION DATA:
${formDataStr}`,

    approval: `You are a senior compliance officer at a regulated financial institution.
A staff member has submitted a compliance approval request. Review the submission and provide:
1. A concise summary of what is being requested
2. Regulatory considerations: applicable regulations and requirements
3. Potential risks or red flags identified
4. Conditions or recommendations for approval (or reasons to decline)
5. Overall risk classification: LOW / MEDIUM / HIGH

Be professional and concise.

SUBMISSION DATA:
${formDataStr}`,

    disclosure: `You are a senior compliance officer at a regulated financial institution.
A staff member has submitted a voluntary disclosure. Review and provide:
1. Summary of the disclosure
2. Conflict of interest or regulatory implications
3. Required follow-up actions
4. Whether escalation to senior management is recommended

Be professional and concise.

SUBMISSION DATA:
${formDataStr}`,

    query: `You are a senior compliance officer at a regulated financial institution.
A staff member has submitted a compliance advisory query. Review and provide:
1. Summary of the question
2. Relevant regulatory framework (cite specific regulations where possible)
3. Preliminary guidance or key considerations
4. Recommendation: can this be handled by compliance team directly, or does it require legal counsel?

Be professional and concise.

SUBMISSION DATA:
${formDataStr}`,
  };

  const systemPrompt = prompts[module || formData.module] || prompts.query;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: systemPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', err);
      return res.status(502).json({
        success: false,
        error: err.error?.message || 'Upstream API error (' + response.status + ')',
      });
    }

    const data = await response.json();
    const analysis = data.content && data.content[0] ? data.content[0].text : '(No response)';

    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    console.error('Incident review error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
