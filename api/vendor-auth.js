const crypto = require('crypto');

// Simple in-memory rate limiting per IP
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;



function cleanupAttempts() {
const now = Date.now();
for (const [ip, data] of attempts.entries()) {
if (data.lockedUntil && data.lockedUntil < now) {
attempts.delete(ip);
}
}
}

function getClientIP(req) {
return (
req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
req.headers['x-real-ip'] ||
req.connection?.remoteAddress ||
'unknown'
);
}

function generateToken(secret) {
const payload = {
authenticated: true,
iat: Date.now(),
exp: Date.now() + 24 * 60 * 60 * 1000
};
const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
const signature = crypto
.createHmac('sha256', secret)
.update(data)
.digest('base64url');
return `${data}.${signature}`;
}

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

// GET = verify existing token
if (req.method === 'GET') {
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
return res.status(401).json({ valid: false });
}
const token = authHeader.slice(7);
const valid = verifyToken(token, process.env.VENDOR_AUTH_SECRET);
return res.status(valid ? 200 : 401).json({ valid });
}

// POST = login
if (req.method !== 'POST') {
return res.status(405).json({ error: 'Method not allowed' });
}

cleanupAttempts();

const ip = getClientIP(req);
const ipData = attempts.get(ip) || { count: 0, lockedUntil: 0 };

// Check lockout
if (ipData.lockedUntil && ipData.lockedUntil > Date.now()) {
const remaining = Math.ceil((ipData.lockedUntil - Date.now()) / 1000);
return res.status(429).json({
success: false,
message: `Too many attempts. Locked for ${Math.ceil(remaining / 60)} minutes.`,
lockedUntil: ipData.lockedUntil,
remainingSeconds: remaining
});
}

const { password } = req.body || {};

if (!password) {
return res.status(400).json({ success: false, message: 'Password is required.' });
}

const correctPassword = process.env.VENDOR_SITE_PASSWORD;
if (!correctPassword) {
console.error('SITE_PASSWORD not configured');
return res.status(500).json({ success: false, message: 'Server configuration error.' });
}

// Timing-safe comparison
const passwordBuffer = Buffer.from(password);
const correctBuffer = Buffer.from(correctPassword);

let match = false;
if (passwordBuffer.length === correctBuffer.length) {
match = crypto.timingSafeEqual(passwordBuffer, correctBuffer);
}

if (match) {
// Reset attempts on success
attempts.delete(ip);
const token = generateToken(process.env.VENDOR_AUTH_SECRET);
return res.status(200).json({ success: true, token });
}

// Failed attempt
ipData.count += 1;
if (ipData.count >= MAX_ATTEMPTS) {
ipData.lockedUntil = Date.now() + LOCKOUT_MS;
attempts.set(ip, ipData);
return res.status(429).json({
success: false,
message: `Too many failed attempts. Locked for 15 minutes.`,
lockedUntil: ipData.lockedUntil
});
}

attempts.set(ip, ipData);
const remaining = MAX_ATTEMPTS - ipData.count;

return res.status(401).json({
success: false,
message: `Invalid password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
attemptsRemaining: remaining
});
};