const crypto = require('crypto');

/* ── Token verification ── */
function verifyToken(token, secret) {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return false;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (signature !== expectedSig) return false;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Date.now()) return false;
    return payload.authenticated === true;
  } catch {
    return false;
  }
}

/* ── Dilisense helpers ── */
async function checkEntity(apiKey, companyName) {
  try {
    const url = 'https://api.dilisense.com/v1/checkEntity?names='
      + encodeURIComponent(companyName) + '&fuzzy_search=1';
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
    if (!res.ok) {
      console.error('Dilisense checkEntity error:', res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('Dilisense checkEntity failed:', e);
    return null;
  }
}

async function checkIndividual(apiKey, name) {
  try {
    const url = 'https://api.dilisense.com/v1/checkIndividual?names='
      + encodeURIComponent(name) + '&fuzzy_search=1';
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
    if (!res.ok) {
      console.error('Dilisense checkIndividual error:', res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('Dilisense checkIndividual failed:', e);
    return null;
  }
}

/* ── News helper (zelfde logica als news.js) ── */

function dedupeNews(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = i.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


async function fetchNews(query, maxItems) {
  maxItems = maxItems || 5;
  try {
    const rssUrl = 'https://news.google.com/rss/search?q='
      + encodeURIComponent(query) + '&hl=en&gl=US&ceid=US:en';
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'CompliancePortal/1.0' } });
    if (!response.ok) return [];
    const xml = await response.text();
    const items = [];
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
      const block = match[1];
      const titleMatch  = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const linkMatch   = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      const dateMatch   = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
      const title  = titleMatch  ? titleMatch[1].trim()  : '';
      const link   = linkMatch   ? linkMatch[1].trim()   : '';
      const source = sourceMatch ? sourceMatch[1].trim() : '';
      const date   = dateMatch   ? dateMatch[1].trim()   : '';
if (title && link) {

  const text = (title + ' ' + (source || '')).toLowerCase();

  const negativeKeywords = [
    'sanction','fraud','money laundering','aml','terror','crime','criminal',
    'investigation','regulator','fine','penalty','lawsuit','litigation',
    'corruption','bribery','embezzle','scandal','arrest','charged',
    'warning','compliance','violation','breach','risk'
  ];

  const isAdverse = negativeKeywords.some(function(k){ return text.indexOf(k) !== -1; });

  if (isAdverse) {
    items.push({
      title: title.substring(0, 200),
      link: link,
      source: (source || '').substring(0, 100),
      date: date
    });
  }
}

return dedupeNews(items);

    }
    return items;
  } catch (e) {
    console.error('fetchNews failed for', query, e);
    return [];
  }
}





/* ── Helper: summarize Dilisense hits ── */
function summarizeHits(data, limit) {
  if (!data || !Array.isArray(data.found_records)) return [];
  return data.found_records.slice(0, limit).map(m => ({
    name:        m.name,
    sourceType:  m.source_type,                    // SANCTION | PEP | CRIMINAL | OTHER
    sourceId:    m.source_id,                      // e.g. "EU_SANCTIONS"
    pepType:     m.pep_type || null,
    pepLevel:    m.pep_level || null,
    details:     Array.isArray(m.sanction_details)
                   ? m.sanction_details.slice(0, 3)
                   : null,
    jurisdiction: Array.isArray(m.jurisdiction)
                   ? m.jurisdiction
                   : (Array.isArray(m.source_country) ? m.source_country : null)
  }));
}

/* ── Helper: extract first JSON object from text ── */
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
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
      '  latestNews        - object with: entity (array), ubos (array)',
      '  companyAnalysis   - string',
      '  amlRisks          - array of strings',
      '  riskAnalysis      - string with a motivated explanation for the risk rating, covering key risk factors (including database screening results), mitigating factors, and an overall assessment (3-5 sentences)',
      '  shortSummary      - string',
      '  riskRating        - "HIGH", "MEDIUM", or "LOW"',
      'Base your analysis on the company data, the database screening results, and publicly known information.',
      'Database hits (sanctions, PEP, criminal) should significantly influence the risk rating.',
'Be concise and professional.',
      'Include a section "latestNews" in the JSON output with:',
      '  latestNews - object with:',
      '    entity (array of {title, source, date, link, relevance}),',
      '    ubos (array of {uboName, items: array of {title, source, date, link, relevance}})',
      'Rules for latestNews:',
      '  Only include news relevant to AML, sanctions, fraud, litigation or reputational risk.',
      '  Remove generic or irrelevant articles.',
      '  Keep entries concise.',
      '  If no relevant news is relevant, return empty arrays.'
    ].join('\n');

    /* ════════════════════════════════════════
       STEP 1: Run Dilisense database screening
       ════════════════════════════════════════ */
    let dilisenseContext = '';
    let entityScreening = null;
    let uboScreening = [];

    if (dilisenseKey) {
      dilisenseContext = '\n\n--- BEGIN DATABASE SCREENING ---\n';

      // Entity screening
      if (payload && payload.companyName) {
        entityScreening = await checkEntity(dilisenseKey, payload.companyName);
      }

      // UBO screening
      const ubos = (payload && Array.isArray(payload.ubos)) ? payload.ubos : [];
      for (const ubo of ubos) {
        const uboName = ubo && ubo.name ? ubo.name : null;
        if (!uboName) continue;
        const results = await checkIndividual(dilisenseKey, uboName);
        uboScreening.push({ uboName, results });
      }

      dilisenseContext += 'Entity screening results:\n';
      dilisenseContext += entityScreening
  ? JSON.stringify({
      totalHits: entityScreening.total_hits || 0,
      hits: summarizeHits(entityScreening, 5)
    }, null, 2)
  : 'No results or API call failed.';

      if (uboScreening.length > 0) {
        dilisenseContext += '\n\nUBO screening results:\n';
        for (const ubo of uboScreening) {
          dilisenseContext += '\n' + ubo.uboName + ':\n';
          dilisenseContext += ubo.results
            ? JSON.stringify({ hits: summarizeHits(ubo.results, 3) }, null, 2)
            : 'No results or API call failed.';
        }
      } else {
        dilisenseContext += '\n\nNo UBOs were provided for screening.';
      }
      dilisenseContext += '\n--- END DATABASE SCREENING ---';
    } else {
      dilisenseContext = '\n\nNo database screening was performed (Dilisense API key not configured). Analyze based on publicly known information only.';
    }


  /* ════════════════════════════════════════
       STEP 1a: Run News screening
       ════════════════════════════════════════ */


/* ── News screening (entiteit + UBOs) ── */
const newsResults = { entity: [], ubos: [] };
if (payload.companyName) {
  newsResults.entity = await fetchNews(payload.companyName, 3);
}
if (Array.isArray(payload.ubos)) {
  for (const ubo of payload.ubos) {
    const uboName = ubo.name || ubo;
    if (!uboName) continue;
    const items = await fetchNews(uboName, 2);
    newsResults.ubos.push({ uboName, items });
  }
}

let newsContext = '\n\n--- LATEST NEWS (Google News RSS) ---\n';
newsContext += 'Entity (' + (payload.companyName || 'unknown') + '):\n'
  + (newsResults.entity.length ? JSON.stringify(newsResults.entity, null, 2) : 'No recent news found.');
if (newsResults.ubos.length) {
  newsContext += '\n\nUBO news:\n';
  for (const u of newsResults.ubos) {
    newsContext += '\n' + u.uboName + ':\n'
      + (u.items.length ? JSON.stringify(u.items, null, 2) : 'No recent news found.');
  }
}
newsContext += '\n--- END LATEST NEWS ---';

/* ── Trim news context om token overflow te voorkomen ── */
const MAX_NEWS_CONTEXT = 15000;
if (newsContext.length > MAX_NEWS_CONTEXT) {
  console.warn('News context too large, trimming...');
  newsContext = newsContext.substring(0, MAX_NEWS_CONTEXT);
}



    /* ════════════════════════════════════════
       STEP 2: Build user prompt
       ════════════════════════════════════════ */
    let userPrompt = 'Screen the following corporate profile for adverse media and open-source sanctions concerns. Return concise professional findings.\n\n'
      + JSON.stringify(payload, null, 2);

    /* ════════════════════════════════════════
       STEP 3: Call Claude API
       ════════════════════════════════════════ */
    const MAX_INPUT_SIZE = 60000;
    let finalUserPrompt = userPrompt + dilisenseContext + newsContext;

  if ((systemPrompt + finalUserPrompt).length > MAX_INPUT_SIZE) {
  console.warn('Prompt too large, trimming contexts');
  dilisenseContext = dilisenseContext.substring(0, 15000);
  newsContext = newsContext.substring(0, 10000);
  finalUserPrompt = userPrompt + dilisenseContext + newsContext;
}

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        temperature: 0,
        system: systemPrompt,
        messages: [
          { role: 'user', content: finalUserPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      return res.status(502).json({
        error: 'Claude API request failed',
        status: response.status,
        message: errText
      });
    }

    const data = await response.json();

    if (data.stop_reason === 'max_tokens') {
      console.error('Claude response was truncated because max_tokens was reached.');
      return res.status(502).json({
        error: 'AI response was truncated',
        message: 'The screening output was too large. Reduce database detail or increase max_tokens.'
      });
    }

    const textContent = Array.isArray(data.content)
      ? data.content.map(function (part) { return part.text || ''; }).join('\n')
      : '';

    /* ── Strip markdown code fences if present ── */
    let cleaned = textContent.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    /* ── Parse JSON safely ── */
    let parsed;
    try {
      const jsonString = extractJson(cleaned);

      if (!jsonString) {
        throw new Error('No JSON found in AI response');
      }

      if (!jsonString.trim().endsWith('}')) {
        console.error('TRUNCATED JSON RESPONSE:', jsonString);
        throw new Error('Incomplete JSON detected. AI response appears truncated.');
      }

      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('RAW AI RESPONSE:', cleaned);
      throw new Error('Invalid JSON from AI: ' + e.message);
    }

    parsed.rawDatabaseScreening = {
      entity: entityScreening || null,
      ubo: uboScreening || []
    };

    parsed.rawNewsScreening = newsResults;
    
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Screening API error:', error.message);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
