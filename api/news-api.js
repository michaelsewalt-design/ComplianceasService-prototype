export default async function handler(req, res) {
  try {
    const url = "https://news.google.com/rss/search?q=compliance+AML+DORA&hl=en-US&gl=US&ceid=US:en";

    const response = await fetch(url);
    const xml = await response.text();

    const items = [...xml.matchAll(/<item>(.*?)<\/item>/gs)].slice(0, 4);

    const news = items.map(item => {
      const content = item[1];

      const titleMatch = content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const linkMatch = content.match(/<link>(.*?)<\/link>/);

      return {
        title: titleMatch ? titleMatch[1] : "No title",
        link: linkMatch ? linkMatch[1] : "#"
      };
    });

    res.status(200).json(news);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch news" });
  }
}
