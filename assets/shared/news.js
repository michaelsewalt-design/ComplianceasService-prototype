async function loadNews() {
  const list = document.getElementById('news-list');
  if (!list) return;

  try {
    const response = await fetch('/api/news', { headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      throw new Error('News endpoint returned an error');
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      list.innerHTML = '<li class="news-list__status">No news available right now.</li>';
      return;
    }

    list.innerHTML = '';
    data.slice(0, 4).forEach((article) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = article.link || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = article.title || 'Open article';
      li.appendChild(a);
      list.appendChild(li);
    });
  } catch (error) {
    console.error('News feed error:', error);
    list.innerHTML = '<li class="news-list__status">Unable to load news.</li>';
  }
}

document.addEventListener('DOMContentLoaded', loadNews);
