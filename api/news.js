export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  try {
    const rssUrl = 'https://news.google.com/rss/search?q=compliance+regulation+AML+DORA&hl=en-US&gl=US&ceid=US:en';
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ComplianceNewsBot/1.0)'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch RSS feed' });
    }

    const xml = await response.text();
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
    const linkRegex = /<link>([\s\S]*?)<\/link>/i;

    const results = [];
    let match;

    while ((match = itemRegex.exec(xml)) !== null && results.length < 4) {
      const item = match[1];
      const titleMatch = item.match(titleRegex);
      const linkMatch = item.match(linkRegex);

      if (!titleMatch || !linkMatch) continue;

      const title = titleMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
      const link = linkMatch[1].trim();

      if (!title || !link) continue;
      results.push({ title, link });
    }

    return res.status(200).json(results);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch news' });
  }
}
