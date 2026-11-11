# 新闻聚焦：獨立新聞網站 + AI 匯入工具

這個專案包含兩個部分，跑在同一個 Node 服務裡：

- **公開網站**（`/`）：版面參考 newstotruth.com，有首頁頭條、三欄卡片、七個分類頁、文章頁、搜尋與分頁，手機版自動調整。
- **後台**（`/admin`）：貼上一篇已授權文章的網址，工具會抓取內容、用 Claude 整理成簡體中文的標題、摘要、正文、分類與標籤，把圖片存下來，建立一篇**草稿**。在後台檢查、修改後按「發佈」，文章才會出現在網站上。

文章與圖片存在 `data/` 資料夾（`posts.json` 與 `media/`），不需要資料庫，也不需要 WordPress。備份只要複製這個資料夾。

若想改回「寫進 WordPress 草稿」的舊模式，在 `.env` 設 `IMPORT_TARGET=wordpress` 並依下方 WordPress 段落設定。原始規劃見 [docs/ai-import-plan.md](docs/ai-import-plan.md)。

## 一次性設定

需要 Node.js 22 以上。

```bash
cp .env.example .env
```

編輯 `.env`，填入 `ANTHROPIC_API_KEY`（沒有它無法匯入）、後台登入密碼 `ADMIN_PASSWORD`、一串隨機的 `SESSION_SECRET`，需要的話改 `SITE_NAME` 與 `SITE_TAGLINE`。

```bash
corepack pnpm install
```

## 日常使用

```bash
corepack pnpm dev
```

- 網站：<http://localhost:3000>
- 後台：<http://localhost:3000/admin>，登入後貼上文章網址按「建立草稿」，完成後點「檢查並發佈」。

後台可以修改標題、摘要、分類、標籤、首圖與正文（每段空一行，圖片寫成 `![說明](圖片網址)`），也可以撤回或刪除文章。草稿只有登入後才能預覽。

想先看版面效果，可以產生十篇示例文章（之後在後台逐篇刪除）：

```bash
corepack pnpm seed:demo
```

## WordPress 模式（可選，IMPORT_TARGET=wordpress）


1. 在 wp-admin 新增使用者 `ai-importer`，角色 **Author**（只能建立自己的文章）或 **Editor**。
2. 進入該使用者的個人資料頁，在「應用程式密碼」區塊新增一組密碼，複製下來。
3. 把 [wordpress/mu-plugins/ntt-source-url.php](wordpress/mu-plugins/ntt-source-url.php) 上傳到網站的 `wp-content/mu-plugins/` 資料夾（沒有就建立）。它會自動啟用，用來記錄每篇文章的來源網址並避免重複匯入。沒裝也能用，只是不會查重。

此模式下 `/admin` 建立的是 WordPress 草稿，發佈在 wp-admin 操作。

## 行為說明

- 只接受公開網站的 http/https 網址，封鎖內網與本機位址。
- AI 一律輸出簡體中文，保留「【大纪元…讯】」之類的來源抬頭，分類只能是站上七個分類之一，拿不準時用「最新」。
- 圖片最多 8 張，第一張設為特色圖片，其餘依原文位置插入內文；下載失敗的圖片會略過，不影響整篇。
- 文末自動加上「原文链接」。
- 同一來源網址已匯入過時，直接回傳既有文章（WordPress 模式需安裝 mu-plugin）。
- 模型預設 `claude-opus-5-5`，可在 `.env` 改成 `claude-sonnet-5-5` 或 `claude-haiku-5-5` 降低費用。

## 開發

```bash
corepack pnpm test     # 單元測試
corepack pnpm check    # TypeScript 型別檢查
corepack pnpm build    # 產生 dist/，之後用 corepack pnpm start 執行
```

## 部署到雲端（可選）

整個網站是一個 Node 服務，不需要資料庫。部署到 Railway、Render 或 Fly.io 時，設定 `.env.example` 裡的環境變數，啟動指令用 `pnpm build && pnpm start`。

**重要**：`DATA_DIR` 必須指向永久磁碟（volume），否則每次重新部署文章與圖片都會消失。服務只能跑一個實例。
