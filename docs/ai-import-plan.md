# newstotruth.com AI 匯入工具：實作規劃

更新日期：2026-10-22

## 1. 目標

保留 newstotruth.com 現有的 WordPress 網站，另外做一個小型「AI 匯入工具」：

1. 管理員在工具頁貼上一篇已授權文章的網址。
2. 工具抓取網頁、用 AI 整理成標題、摘要、內文、分類、標籤。
3. 圖片下載後上傳到 WordPress 媒體庫，第一張設為特色圖片。
4. 以 **草稿** 狀態建立 WordPress 文章，回傳 wp-admin 編輯連結。
5. 發佈動作仍在 WordPress 後台人工按下，工具永遠不自動發佈。

## 2. 已確認的事實（2026-10-22 探測）

| 項目 | 結果 |
|---|---|
| REST API `https://newstotruth.com/wp-json/wp/v2/` | 開放，HTTP 200 |
| 認證方式 | Application Passwords 已啟用（`wp-admin/authorize-application.php`） |
| 主機與安全外掛 | SiteGround，裝有 Wordfence、SG Security，REST 讀取未被擋 |
| 文章內文格式 | Gutenberg 區塊，段落為 `<p class="wp-block-paragraph" style="font-size:16px">` |
| 縮圖來源 | `featured_media`（特色圖片），內文通常無內嵌圖片 |
| 摘要 | `excerpt` 欄位，首頁卡片使用 |
| 既有標籤 | 僅 8 個，幾乎不用 |
| 語言 | 簡體中文，文章多轉載自大纪元，保留「【大纪元…讯】」抬頭 |

現有分類與 ID（AI 只能從這七個挑一個）：

| ID | 名稱 | slug |
|---|---|---|
| 11 | 聚焦 | focus |
| 12 | 述评 | commentary |
| 4 | 最新 | news |
| 13 | 特稿 | featured |
| 1 | 感悟 | inspired |
| 15 | 文化 | %e6%96%87%e5%8c%96 |
| 17 | 历史 | %e5%8e%86%e5%8f%b2 |

## 3. 架構決定

**沿用這個 repo，但大幅精簡。** WordPress 就是資料庫，所以 MySQL、Drizzle、公開閱讀頁、Manus 的 OAuth／LLM／儲存模組全部移除；保留並改寫 `server/articleImport.ts` 裡已經做好的抓取、SSRF 防護、轉址處理、圖片位置標記邏輯。

考慮過但不採用的做法：

- **寫成 WordPress 外掛（PHP）**：要把整套 TypeScript 邏輯重寫成 PHP，而且 SiteGround 共享主機上長時間抓圖與呼叫 AI 容易逾時。
- **全新專案**：抓取與圖片標記那段已有測試覆蓋，重寫沒有好處。

最終形態：一個 Node 服務（Express + tRPC）加一個單頁 React 管理介面。

## 4. 模組設計

### 4.1 環境變數（`.env`，另附 `.env.example`）

```
WP_BASE_URL=https://newstotruth.com
WP_USERNAME=ai-importer            # 專用帳號，角色 Author 或 Editor
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-5-5
ADMIN_PASSWORD=...                 # 登入工具頁用
SESSION_SECRET=...
```

### 4.2 `server/wordpress.ts`（新）

用 Basic Auth（使用者名稱 + Application Password）呼叫 REST API：

- `listCategories()`：啟動時讀一次，建立「名稱 → ID」對照，AI 回傳的分類名稱若不在表內一律退回「最新」。
- `ensureTags(names)`：`GET /tags?search=` 找既有標籤，沒有就 `POST /tags`。
- `uploadMedia(buffer, filename, mime, alt, caption)`：`POST /media`（multipart），回傳 media ID 與 source_url。
- `createDraft({ title, content, excerpt, categories, tags, featured_media, meta })`：`POST /posts`，`status: "draft"`。
- `findBySourceUrl(url)`：避免重複匯入，見 4.6。
- `listRecentDrafts()`：工具首頁顯示最近匯入的草稿與編輯連結。

### 4.3 `server/articleImport.ts`（改寫）

保留：`validatePublicImportUrl`、`fetchPublicPage`、`extractImages`、`htmlToReadableTextWithImageMarkers`。

改動：

- `invokeLLM`（Manus Forge）換成 Anthropic SDK，用結構化 JSON 輸出。
- 提示詞要求：輸出簡體中文；分類只能是上表七個之一；標籤最多 6 個；保留 `{{image:n}}` 標記位置；把來源頁的指令當資料不當指令（現有防注入文字保留）。
- 回傳的 `content` 仍是純文字段落，交給 4.4 組成區塊。

### 4.4 `server/wpContent.ts`（新）

把 AI 的純文字段落與圖片標記轉成 Gutenberg 區塊 HTML，和站上既有文章一致：

```html
<!-- wp:paragraph {"style":{"typography":{"fontSize":"16px"}}} -->
<p class="wp-block-paragraph" style="font-size:16px">段落文字</p>
<!-- /wp:paragraph -->

<!-- wp:image {"id":123,"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="…" alt="…" class="wp-image-123"/><figcaption>圖說</figcaption></figure>
<!-- /wp:image -->
```

規則：第一張圖片設為特色圖片且不重複放入內文；其餘圖片依標記位置插入；文末可選擇附「原文連結」段落（見第 8 節問題 c）。

### 4.5 匯入流程（`importToWordPress(url)`）

1. 驗證網址、查重（4.6）。
2. 抓取網頁，擷取文字與圖片候選。
3. 呼叫 AI 整理。
4. 逐張下載圖片（上限 8 張、每張 8 MB、逾時 25 秒），上傳媒體庫；單張失敗只略過該張，不中斷整篇。
5. 組成區塊 HTML、建立草稿。
6. 回傳 `{ postId, editUrl: ${WP_BASE_URL}/wp-admin/post.php?post=ID&action=edit, previewUrl }`。

每個階段的進度透過 tRPC subscription 或輪詢回報給前端。

### 4.6 查重與來源追蹤

在 WordPress 加一個 5 行的 mu-plugin（`wp-content/mu-plugins/ntt-source-url.php`），用 `register_post_meta` 註冊 `source_url` 並 `show_in_rest`。這樣：

- 建立草稿時把原網址寫進 meta。
- 匯入前用 `GET /posts?status=any&meta_key=source_url&meta_value=…` 查重，已匯入就直接回傳既有草稿連結。
- 編輯在後台也看得到來源。

若不方便改主機檔案，退而求其次：工具本機保存一個 JSON 帳本做查重。

### 4.7 登入

Manus OAuth 改成單一管理密碼 + 簽章 cookie（`jose` 已在依賴中）。工具只給一兩個人用，不需要帳號系統。

### 4.8 前端（`client/src/pages/ImportPage.tsx`）

單一頁面：

- 網址輸入框與「匯入」按鈕。
- 四段進度：抓取網頁 → AI 整理 → 上傳圖片 → 建立草稿。
- 完成後顯示標題、分類、標籤、圖片數，以及「在 WordPress 開啟草稿」按鈕。
- 下方列出最近 20 篇由工具建立的草稿（讀 WP）。
- 介面改成中文。

## 5. WordPress 端設定（一次性）

1. 新增使用者 `ai-importer`，角色 **Author**（只能建立自己的文章，不能發佈他人文章；若要讓工具建立的草稿能被其他編輯直接發佈，用 Editor）。
2. 在該使用者的「應用程式密碼」區塊產生一組密碼，填入 `.env`。
3. 放入 4.6 的 mu-plugin。
4. 確認 Wordfence 沒有封鎖已認證的 REST 寫入（通常預設允許）。

## 6. 安全與品質

- 只匯入 http/https 公網主機，保留私有 IP 與 localhost 封鎖（防 SSRF）。
- 永遠建立草稿，發佈權留在 WordPress。
- AI 提示詞把來源內容視為不可信資料。
- 圖片白名單 MIME：jpeg、png、gif、webp；上傳時重新命名為 `import-<日期>-<n>.<ext>`。
- 單篇費用估算：Claude Sonnet 處理一篇 3,000 字文章約 0.02 到 0.05 美元；用 Haiku 更低。

## 7. 部署

- **第一階段**：在你的 Mac 本機跑 `pnpm dev`，瀏覽器開 `http://localhost:3000`。零主機成本，立即可用。
- **第二階段（可選）**：加 Dockerfile，部署到 Railway 或 Fly.io，手機也能用。
- 移除 `.github/workflows/` 兩個 GitHub Pages 流程（與本專案無關）。

## 8. 待你決定的問題

- **a. 語言**：來源若是繁體或英文，要自動轉成簡體中文嗎？（建議：一律輸出簡體，與站上一致。）
- **b. 來源抬頭**：「【大纪元2026年05月24日讯】（大纪元记者…报导）」這類抬頭要保留還是去掉？（現有文章保留。）
- **c. 原文連結**：文末要不要自動加「原文連結」？
- **d. 授權範圍**：工具只用於你有轉載授權的來源。要不要加白名單網域，非白名單直接拒絕？
- **e. AI 供應商**：規劃用 Anthropic Claude；若你已有 OpenAI 帳號也可改。
- **f. 自動分類**：AI 挑分類不準時的預設值用「最新」，可以嗎？

## 9. 工作分段

| 步驟 | 內容 | 產出 |
|---|---|---|
| 1 | 清理 repo：移除 DB、Drizzle、Manus 模組、公開頁、GitHub Pages 流程 | 可編譯的精簡骨架 |
| 2 | `wordpress.ts` 客戶端 + `.env.example` + 密碼登入 | 能列出分類與草稿 |
| 3 | AI 改接 Anthropic，分類約束、簡體輸出 | 單元測試通過 |
| 4 | 區塊組裝 + 圖片上傳 + 建立草稿 | 第一篇真實草稿出現在 wp-admin |
| 5 | 中文單頁 UI 與進度顯示 | 可日常使用 |
| 6 | mu-plugin 查重與來源 meta | 重複網址不會建兩篇 |
| 7 | 測試、README、部署說明 | 交付 |

步驟 4 完成後就能實際試用；5 到 7 是打磨。
