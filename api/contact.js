export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      fullName = '',
      company = '',
      jobTitle = '',
      email = '',
      messageType = '',
      serviceModule = '',
      details = '',
      sourcePage = '',
      submittedAt = ''
    } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (!fullName || !company || !jobTitle || !email || !messageType) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const validTypes = new Set(['access', 'advisory', 'suggestion']);
    if (!validTypes.has(messageType)) {
      return res.status(400).json({ error: 'Invalid message type.' });
    }

    if (messageType === 'access' && !serviceModule) {
      return res.status(400).json({ error: 'Please select a service module.' });
    }

    if ((messageType === 'advisory' || messageType === 'suggestion') && !details) {
      return res.status(400).json({ error: 'Please provide message details.' });
    }

    const submission = {
      fullName,
      company,
      jobTitle,
      email,
      messageType,
      serviceModule,
      details,
      sourcePage,
      submittedAt,
      receivedAt: new Date().toISOString()
    };

    const webhookUrl = process.env.CONTACT_WEBHOOK_URL;

    if (webhookUrl) {
      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission)
      });

      if (!webhookResponse.ok) {
        const text = await webhookResponse.text().catch(() => '');
        return res.status(502).json({ error: text || 'Webhook delivery failed.' });
      }
    } else {
      console.log('Contact submission received without CONTACT_WEBHOOK_URL configured:', submission);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
}
