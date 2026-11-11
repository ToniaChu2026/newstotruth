# 新闻聚焦：存在 GitHub 上的新聞網站

版面參考 newstotruth.com 的靜態新聞網站。**文章和圖片都存在這個 repo 裡**，push 到 `main` 之後 GitHub 會自動重新產生網站並發佈到 GitHub Pages。不需要主機、資料庫或後台，也不用付費。

## 怎麼加文章

在 Claude Code 裡開啟這個專案，貼上文章連結並說「加入這篇文章」。Claude 會：

1. 抓取網頁，整理成簡體中文的標題、摘要、正文、分類與標籤；
2. 下載圖片到 `content/media/`，把文章寫成 `content/posts/` 裡的一個檔案；
3. commit 並 push（若這台電腦沒設定 GitHub 憑證，最後一步需要你自己執行 `git push`）。

push 後約一兩分鐘，網站就會出現新文章。完整步驟寫在 [CLAUDE.md](CLAUDE.md)，Claude 每次都會照著做。

只加入你有轉載授權的來源。

## 第一次設定（只做一次）

1. 到 GitHub repo 的 **Settings → Pages**，把 **Source** 設成 **GitHub Actions**。
2. push 到 `main`。到 **Actions** 分頁可以看到「Deploy site」在跑，完成後網址會顯示在 Settings → Pages（預設是 `https://<帳號>.github.io/<repo 名稱>/`）。

要用自己的網域，在 Settings → Pages 的 Custom domain 填入即可，網站會自動改用該網域，不用改程式。

## 文章檔案長什麼樣

`content/posts/2026-11-10-01.md`：

```
---
title: 文章标题
date: 2026-11-10T08:00:00.000Z
category: 感悟
tags: 标签一、标签二
image: /media/2026-11-10-01-1.jpg
source: https://example.com/original
excerpt: 显示在首页卡片上的摘要。
---

第一段正文。

![图片说明](/media/2026-11-10-01-2.jpg "图说")

第二段正文。
```

- 開頭兩條 `---` 之間，一行一個「欄位: 值」。
- `category` 只能是：聚焦、述评、最新、特稿、感悟、文化、历史。
- 加一行 `draft: true` 文章就不會上線。
- 檔名（去掉 `.md`）就是文章網址：`/post/2026-11-10-01/`。
- 要修改文章，直接在 GitHub 網頁上編輯這個檔案並 commit；要刪除就刪掉檔案。

網站名稱、標語、每頁篇數在 [content/site.json](content/site.json)。

## 本機預覽

需要 Node.js 22 以上。

```bash
corepack pnpm install
```

```bash
corepack pnpm dev
```

開 <http://localhost:3000>。改動 `content/` 或程式會自動重新產生。

## 其他指令

```bash
corepack pnpm build    # 產生網站到 dist/
corepack pnpm test     # 單元測試
corepack pnpm check    # TypeScript 型別檢查
```

不透過 Claude Code、想讓程式直接呼叫 Claude API 整理文章時，在 `.env` 填入 `ANTHROPIC_API_KEY` 後執行：

```bash
corepack pnpm article auto "https://example.com/article"
```

## 行為說明

- 只抓取公開網站的 http/https 網址，封鎖內網與本機位址。
- 圖片每篇最多 8 張，正文中第一張當首圖，其餘留在原位；下載失敗的圖片會略過，不影響整篇。
- 同一個來源網址不會加入第二次。
- 文章頁文末自動顯示「原文链接」。
- 搜尋在瀏覽器裡進行（載入一份文章索引後篩選），不需要伺服器。

## 舊版本

這個 repo 之前是「Node 伺服器 + 後台」與「寫進 WordPress 草稿」的版本，程式碼保留在 git 歷史裡（commit `b9a645d`）。
