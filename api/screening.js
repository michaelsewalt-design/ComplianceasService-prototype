const crypto = require('crypto');

function verifyToken(token, secret) {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return false;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (signature !== expectedSig) return false;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Date.now()) return false;
    return payload.authenticated === true;
  } catch { return false; }
}

/* ── Dilisense helpers ── */
async function checkEntity(apiKey, companyName) {
  try {
    const url = 'https://api.dilisense.com/v1/checkEntity?names='
      + encodeURIComponent(companyName) + '&fuzzy_search=1';
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
    if (!res.ok) { console.error('Dilisense checkEntity error:', res.status); return null; }
    return await res.json();
  } catch (e) { console.error('Dilisense checkEntity failed:', e); return null; }
}

async function checkIndividual(apiKey, name) {
  try {
    const url = 'https://api.dilisense.com/v1/checkIndividual?names='
      + encodeURIComponent(name) + '&fuzzy_search=1';
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
    if (!res.ok) { console.error('Dilisense checkIndividual error:', res.status); return null; }
    return await res.json();
  } catch (e) { console.error('Dilisense checkIndividual failed:', e); return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── Auth ── */
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

  const apiKey = process.env.SCREENING_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'SCREENING_ANTHROPIC_API_KEY not configured.' });
  }

  try {
    const payload = req.body;
    const dilisenseKey = process.env.DILISENSE_API_KEY;

    /* ════════════════════════════════════════
       STEP 1: Dilisense Database Screening
       ════════════════════════════════════════ */

    let entityScreening = null;
    let uboScreening = [];

    if (dilisenseKey) {
      /* 1a. Check entity (company) */
      if (payload.companyName) {
        entityScreening = await checkEntity(dilisenseKey, payload.companyName);
      }

      /* 1b. Check each UBO (sequential) */
      if (Array.isArray(payload.uboInfo)) {
        for (const ubo of payload.uboInfo) {
          if (ubo.name && ubo.name.trim()) {
            const result = await checkIndividual(dilisenseKey, ubo.name.trim());
            uboScreening.push({
              uboName: ubo.name.trim(),
              ownership: ubo.ownership || '',
              country: ubo.country || '',
              results: result
            });
          }
        }
      }
    }

    /* ════════════════════════════════════════
       STEP 2: Build Claude prompt
       ════════════════════════════════════════ */

    const systemPrompt = [
      'You are an AML/KYC screening assistant.',
      'Return valid JSON only (no markdown fences, no commentary) with the following keys:',
      '  basicCompanyInfo  - object with: companyName, registrationNumber, country, website, industry, uboInfo (array of {name, ownership, country}), overview (string)',
      '  databaseScreening - object with:',
      '    entityHits (array of {name, sourceType, details, source} or empty array if no hits),',
      '    summary (string: concise summary of entity screening findings, or "No hits found in sanctions, PEP, or criminal databases." if empty)',
      '  uboScreening - array of objects, one per UBO:',
      '    {uboName, hits (array of {name, sourceType, pepType, pepLevel, details, source} or empty array), summary (string per UBO)}',
      '    If no UBOs were provided, return empty array.',
      '    If a UBO has no hits, set hits to [] and summary to "No hits found in sanctions, PEP, or criminal databases for [name]."',
      '  adverseMediaFound - array of strings',
      '  companyAnalysis   - string',
      '  amlRisks          - array of strings',
      '  riskAnalysis      - string with a motivated explanation for the risk rating, covering key risk factors (including database screening results), mitigating factors, and an overall assessment (3-5 sentences)',
      '  shortSummary      - string',
      '  riskRating        - "HIGH", "MEDIUM", or "LOW"',
      'Base your analysis on the company data, the database screening results, and publicly known information.',
      'Database hits (sanctions, PEP, criminal) should significantly influence the risk rating.',
      'Be concise and professional.'
    ].join('\n');

    let dilisenseContext = '';
    if (dilisenseKey) {
      dilisenseContext = '\n\n--- DATABASE SCREENING RESULTS ---\n';
      dilisenseContext += '\nEntity screening for "' + (payload.companyName || '') + '":\n';
      dilisenseContext += entityScreening
        ? JSON.stringify(entityScreening, null, 2)
        : 'No results or API call failed.';

      if (uboScreening.length > 0) {
        dilisenseContext += '\n\nUBO screening results:\n';
        for (const ubo of uboScreening) {
          dilisenseContext += '\n' + ubo.uboName + ':\n';
          dilisenseContext += ubo.results
            ? JSON.stringify(ubo.results, null, 2)
            : 'No results or API call failed.';
        }
      } else {
        dilisenseContext += '\n\nNo UBOs were provided for screening.';
      }
      dilisenseContext += '\n--- END DATABASE SCREENING ---';
    } else {
      dilisenseContext = '\n\nNo database screening was performed (Dilisense API key not configured). Analyze based on publicly known information only.';
    }

    const userPrompt = 'Screen the following corporate profile for adverse media and open-source sanctions concerns. Return concise professional findings.\n\n'
      + JSON.stringify(payload, null, 2)
      + dilisenseContext;

    /* ════════════════════════════════════════
       STEP 3: Call Claude API
       ════════════════════════════════════════ */

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
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

    const textContent = Array.isArray(data.content)
      ? data.content.map(function(part) { return part.text || ''; }).join('\n')
      : '';

    var cleaned = textContent.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

let parsed;
try {
  const jsonString = extractJson(cleaned);

  if (!jsonString) {
    throw new Error("No JSON found in AI response");
  }

  parsed = JSON.parse(jsonString);

} catch (e) {
  console.error("RAW AI RESPONSE:", cleaned);
  throw new Error("Invalid JSON from AI: " + e.message);
}
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Screening API error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};