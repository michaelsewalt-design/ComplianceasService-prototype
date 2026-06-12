async function loadNews() {
  const list = document.getElementById("news-list");

  try {
    const res = await fetch("/api/news");
    const data = await res.json();

    list.innerHTML = "";

    data.forEach(article => {
      const li = document.createElement("li");
      const a = document.createElement("a");

      a.href = article.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = article.title;

      li.appendChild(a);
      list.appendChild(li);
    });

  } catch (e) {
    list.innerHTML = "<li>Unable to load news</li>";
  }
}

loadNews();
