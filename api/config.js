module.exports = async (req, res) => {
res.setHeader('Content-Type', 'application/json');

if (req.method !== 'GET') {
return res.status(405).json({ error: 'Method not allowed' });
}

// Verify auth token
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
return res.status(401).json({ error: 'Unauthorized' });
}

const token = authHeader.slice(7);
try {
const crypto = require('crypto');
const [data, signature] = token.split('.');
const expectedSig = crypto
.createHmac('sha256', process.env.TRAINING_AUTH_SECRET)
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

// Return public-safe config (agent IDs are okay to expose)
return res.status(200).json({
aml: {
agent1: process.env.AML_AGENT_1 || '',
agent2: process.env.AML_AGENT_2 || ''
},
mar: {
agent1: process.env.MAR_AGENT_1 || '',
agent2: process.env.MAR_AGENT_2 || ''
},

coi: {
  agent1: process.env.COI_AGENT_1 || '',
  agent2: process.env.COI_AGENT_2 || '',
  agent3: process.env.COI_AGENT_3 || '',
  agent4: process.env.COI_AGENT_4 || '',
  agent5: process.env.COI_AGENT_5 || '',
  agent6: process.env.COI_AGENT_6 || ''
}
});
};