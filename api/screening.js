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
const payload = req.body;

const systemPrompt = [
'You are an AML/KYC & Sanction screening assistant.',
'Return valid JSON only (no markdown fences, no commentary) with the following keys:',
'  basicCompanyInfo  - object with: companyName, registrationNumber, country, website, industry, uboInfo (array of {name, ownership, country}), overview (string)',
'  adverseMediaFound - array of strings',
'  companyAnalysis   - string',
'  amlRisks          - array of strings',
'  shortSummary      - string',
'  riskAnalysis      - string with a motivated explanation for the risk rating, covering key risk factors, mitigating factors, and an overall assessment (3-5 sentences)',
'  riskRating        - "HIGH", "MEDIUM", or "LOW"',
'Base your analysis on publicly known information. Be concise and professional.'
].join('\n');

const userPrompt = 'Screen the following corporate profile for adverse media and open-source sanctions and aml concerns. Return concise professional findings.\n\n' + JSON.stringify(payload, null, 2);

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
