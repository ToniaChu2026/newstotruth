// 搜尋頁：在瀏覽器裡篩選文章。卡片樣式與 components.tsx 的 PostCard 一致。
// 分兩段載入：先載入小的 search-index.json（標題、摘要、標籤），馬上列出結果；
// 再載入大的 search-text.json（正文），補上只在正文裡出現關鍵詞的文章。
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
    var href = base + post.path;
    var article = el("article", "group mb-10 break-inside-avoid");
    if (post.image) {
      var wrap = link(href, "block overflow-hidden bg-stone-100");
      var img = el(
        "img",
        "w-full transition-transform duration-500 group-hover:scale-[1.03]"
      );
      if (post.size) {
        img.width = post.size[0];
        img.height = post.size[1];
      }
      img.alt = "";
      img.loading = "lazy";
      img.src = post.image.charAt(0) === "/" ? base + post.image : post.image;
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
  function load(file) {
    return fetch(base + file).then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    });
  }
  function report(count, searching) {
    status.textContent = count
      ? "“" + query + "” " + (searching ? "已找到 " : "共找到 ") + count +
        " 篇文章" + (searching ? "，正在搜索正文…" : "")
      : searching
        ? "搜索中…"
        : "没有找到与 “" + query + "” 相关的文章。";
  }

  var needle = query.toLowerCase();
  status.textContent = "搜索中…";
  load("/search-index.json")
    .then(function (posts) {
      // 第一段：標題、摘要、標籤。
      var shown = posts.map(function (post) {
        return (
          post.title.toLowerCase().indexOf(needle) !== -1 ||
          post.excerpt.toLowerCase().indexOf(needle) !== -1 ||
          post.tags.join(" ").toLowerCase().indexOf(needle) !== -1
        );
      });
      var count = 0;
      posts.forEach(function (post, index) {
        if (!shown[index]) return;
        count += 1;
        results.appendChild(card(post));
      });
      report(count, true);
      // 第二段：正文。只補上還沒列出的文章。
      return load("/search-text.json").then(
        function (texts) {
          posts.forEach(function (post, index) {
            if (shown[index]) return;
            if ((texts[index] || "").toLowerCase().indexOf(needle) === -1)
              return;
            count += 1;
            results.appendChild(card(post));
          });
          report(count, false);
        },
        function () {
          // 正文索引載入失敗時，保留已經列出的結果。
          status.textContent = count
            ? "“" + query + "” 找到 " + count + " 篇文章（正文搜索暂时无法使用）"
            : "搜索索引加载失败，请稍后再试。";
        }
      );
    })
    .catch(function () {
      status.textContent = "搜索索引加载失败，请稍后再试。";
    });
})();
