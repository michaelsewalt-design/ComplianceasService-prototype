/* ── News Widget – Client-Side ── */

(function () {
  "use strict";

  var MAX_ITEMS = 6;

  function formatDate(raw) {
    if (!raw) return "";
    try {
      var d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) {
      return raw;
    }
  }

  function renderNews(items) {
    var list = document.getElementById("news-list");
    if (!list) return;

    if (!items || items.length === 0) {
      list.innerHTML = '<li class="news-list__status">No recent compliance news available.</li>';
      return;
    }

    var html = "";
    var count = Math.min(items.length, MAX_ITEMS);
    for (var i = 0; i < count; i++) {
      var item = items[i];
      var title = item.title || "Untitled";
      var link = item.link || "#";
      var source = item.source || "";
      var date = formatDate(item.date);
      var meta = source ? source + (date ? " · " + date : "") : date;

      html += '<li class="news-list__item">';
      html += '<a href="' + link + '" target="_blank" rel="noopener noreferrer" class="news-list__link">' + title + '</a>';
      if (meta) {
        html += '<span class="news-list__meta">' + meta + '</span>';
      }
      html += '</li>';
    }
    list.innerHTML = html;
  }

  function loadNews() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/news", true);
    xhr.timeout = 10000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          renderNews(data);
        } catch (e) {
          renderNews([]);
        }
      } else {
        renderNews([]);
      }
    };
    xhr.onerror = function () { renderNews([]); };
    xhr.ontimeout = function () { renderNews([]); };
    xhr.send();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadNews);
  } else {
    loadNews();
  }
})();
