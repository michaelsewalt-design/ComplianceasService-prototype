module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=1800, max-age=1800, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var MAX_ITEMS = 8;
  var RSS_URL = 'https://news.google.com/rss/search?q=compliance+regulation+financial+AML+sanctions&hl=en&gl=US&ceid=US:en';

  try {
    var response = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'CompliancePortal/1.0' }
    });

    if (!response.ok) {
      console.error('RSS fetch failed:', response.status);
      return res.status(200).json([]);
    }

    var xml = await response.text();

    /* Parse <item> blocks with regex (no XML library needed) */
    var items = [];
    var itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    var match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS) {
      var block = match[1];

      var titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/);
      var linkMatch = block.match(/<link>(.*?)<\/link>|<link><!\[CDATA\[(.*?)\]\]>/);
      var sourceMatch = block.match(/<source[^>]*>(.*?)<\/source>|<source[^>]*><!\[CDATA\[(.*?)\]\]><\/source>/);
      var dateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);

      var title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';
      var link = linkMatch ? (linkMatch[1] || linkMatch[2] || '').trim() : '';
      var source = sourceMatch ? (sourceMatch[1] || sourceMatch[2] || '').trim() : '';
      var date = dateMatch ? dateMatch[1].trim() : '';

      if (title && link) {
        items.push({ title: title, link: link, source: source, date: date });
      }
    }

    return res.status(200).json(items);

  } catch (error) {
    console.error('News API error:', error);
    return res.status(200).json([]);
  }
};
