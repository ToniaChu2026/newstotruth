# newstotruth.com AI 匯入工具

貼上一篇已授權文章的網址，工具會抓取內容、用 Claude 整理成簡體中文的標題、摘要、正文、分類與標籤，把圖片上傳到 WordPress 媒體庫，然後在 newstotruth.com 建立一篇**草稿**。發佈仍然在 WordPress 後台人工按下。

規劃與設計說明見 [docs/ai-import-plan.md](docs/ai-import-plan.md)。

## 一次性設定

### 1. WordPress

1. 在 wp-admin 新增使用者 `ai-importer`，角色 **Author**（只能建立自己的文章）或 **Editor**。
2. 進入該使用者的個人資料頁，在「應用程式密碼」區塊新增一組密碼，複製下來。
3. 把 [wordpress/mu-plugins/ntt-source-url.php](wordpress/mu-plugins/ntt-source-url.php) 上傳到網站的 `wp-content/mu-plugins/` 資料夾（沒有就建立）。它會自動啟用，用來記錄每篇文章的來源網址並避免重複匯入。沒裝也能用，只是不會查重。

### 2. 本機環境

需要 Node.js 22 以上。

```bash
cp .env.example .env
```

編輯 `.env`，填入 WordPress 網址、使用者名稱、應用程式密碼、Anthropic API 金鑰、工具登入密碼與一串隨機的 SESSION_SECRET。

```bash
corepack pnpm install
```

## 日常使用

```bash
corepack pnpm dev
```

瀏覽器開 <http://localhost:3000>，輸入登入密碼，貼上文章網址，按「建立草稿」。完成後點「在 WordPress 開啟草稿」檢查、修改並發佈。

## 行為說明

- 只接受公開網站的 http/https 網址，封鎖內網與本機位址。
- AI 一律輸出簡體中文，保留「【大纪元…讯】」之類的來源抬頭，分類只能是站上七個分類之一，拿不準時用「最新」。
- 圖片最多 8 張，第一張設為特色圖片，其餘依原文位置插入內文；下載失敗的圖片會略過，不影響整篇。
- 文末自動加上「原文链接」。
- 同一來源網址已匯入過時，直接回傳既有文章（需安裝 mu-plugin）。
- 模型預設 `claude-opus-5-5`，可在 `.env` 改成 `claude-sonnet-5-5` 或 `claude-haiku-5-5` 降低費用。

## 開發

```bash
corepack pnpm test     # 單元測試
corepack pnpm check    # TypeScript 型別檢查
corepack pnpm build    # 產生 dist/，之後用 corepack pnpm start 執行
```

## 部署到雲端（可選）

工具是一個 Node 服務，不需要資料庫。部署到 Railway、Render 或 Fly.io 時，設定 `.env.example` 裡的所有環境變數，啟動指令用 `pnpm build && pnpm start`。
