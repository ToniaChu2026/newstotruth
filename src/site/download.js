// 下載表單：把電子郵件送到 /api/subscribe（Cloudflare Pages Function），然後顯示下載連結。
// 郵件格式不對時提示重填；伺服器沒回應或存檔失敗時仍顯示連結，讀者一定拿得到檔案。
(function () {
  var form = document.getElementById("download-form");
  var links = document.getElementById("download-links");
  var error = document.getElementById("download-error");
  if (!form || !links || !error) return;
  var EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

  function reveal() {
    form.hidden = true;
    links.hidden = false;
    var first = links.querySelector("a");
    if (first) first.focus();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var email = (form.elements.email.value || "").trim();
    if (email.length > 254 || !EMAIL.test(email)) {
      error.textContent = "请输入正确的电子邮箱。";
      form.elements.email.focus();
      return;
    }
    error.textContent = "";
    var button = form.querySelector("button");
    button.disabled = true;
    fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        page: location.pathname,
        website: form.elements.website.value,
      }),
    })
      .then(function (response) {
        if (response.status === 400) {
          error.textContent = "请输入正确的电子邮箱。";
          button.disabled = false;
          return;
        }
        reveal();
      })
      .catch(reveal);
  });
})();
