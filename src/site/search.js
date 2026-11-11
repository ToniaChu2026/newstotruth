// 搜尋頁：載入文章索引，在瀏覽器裡篩選。卡片樣式與 components.tsx 的 PostCard 一致。
(function () {
  var results = document.getElementById("search-results");
  var status = document.getElementById("search-status");
  var input = document.getElementById("search-input");
  if (!results || !status || !input) return;
  var base = results.getAttribute("data-base") || "";
  var query = (new URLSearchParams(location.search).get("q") || "").trim();
  input.value = query;
  if (!query) {
    status.textContent = "请输入搜索关键词。";
    input.focus();
    return;
  }
  document.title = "搜索：" + query + " | " + document.title.split(" | ").pop();

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function link(href, className, text) {
    var node = el("a", className, text);
    node.href = href;
    return node;
  }
  function card(post) {
    var href = base + "/post/" + post.slug + "/";
    var article = el("article", "group mb-10 break-inside-avoid");
    if (post.image) {
      var wrap = link(href, "block overflow-hidden bg-stone-100");
      var img = el(
        "img",
        "w-full transition-transform duration-500 group-hover:scale-[1.03]"
      );
      img.src = post.image.charAt(0) === "/" ? base + post.image : post.image;
      img.alt = "";
      img.loading = "lazy";
      wrap.appendChild(img);
      article.appendChild(wrap);
    } else {
      article.appendChild(el("div", "h-1 w-12 bg-[var(--brand)]"));
    }
    var body = el("div", "pt-5");
    var meta = el(
      "p",
      "flex flex-wrap items-center gap-x-2 text-xs text-stone-400"
    );
    meta.appendChild(
      el("span", "font-medium text-[var(--brand)]", post.category)
    );
    meta.appendChild(el("span", "", "·"));
    meta.appendChild(el("span", "", post.dateText));
    body.appendChild(meta);
    var title = el(
      "h2",
      "mt-2 text-[23px] font-light leading-[1.4] text-stone-800"
    );
    title.appendChild(link(href, "hover:text-[var(--brand)]", post.title));
    body.appendChild(title);
    body.appendChild(
      el(
        "p",
        "mt-3 line-clamp-5 text-[13.5px] leading-[1.9] text-stone-500",
        post.excerpt
      )
    );
    article.appendChild(body);
    return article;
  }

  status.textContent = "搜索中…";
  fetch(base + "/search-index.json")
    .then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then(function (posts) {
      var needle = query.toLowerCase();
      var found = posts.filter(function (post) {
        return (
          post.title.toLowerCase().indexOf(needle) !== -1 ||
          post.excerpt.toLowerCase().indexOf(needle) !== -1 ||
          post.tags.join(" ").toLowerCase().indexOf(needle) !== -1 ||
          post.text.toLowerCase().indexOf(needle) !== -1
        );
      });
      status.textContent = found.length
        ? "“" + query + "” 共找到 " + found.length + " 篇文章"
        : "没有找到与 “" + query + "” 相关的文章。";
      found.forEach(function (post) {
        results.appendChild(card(post));
      });
    })
    .catch(function () {
      status.textContent = "搜索索引加载失败，请稍后再试。";
    });
})();
