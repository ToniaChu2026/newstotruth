/**
 * 本機預覽：產生網站後用一個小型靜態伺服器送出 dist/。
 * 用 `pnpm dev` 啟動時，改動程式或 content/ 會自動重新產生。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { buildSite } from "./build.tsx";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const { outDir, posts } = await buildSite();
const base = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
const port = Number(process.env.PORT) || 3000;

http
  .createServer((req, res) => {
    let pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname
    );
    if (base && pathname.startsWith(base))
      pathname = pathname.slice(base.length);
    // 正式網站由 Cloudflare Pages Function 存電子郵件；本機只假裝收到。
    if (req.method === "POST" && pathname === "/api/subscribe") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, stored: false, dev: true }));
      return;
    }
    let file = path.join(outDir, path.normalize(pathname));
    if (!file.startsWith(outDir)) file = path.join(outDir, "404.html");
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    const found = fs.existsSync(file);
    if (!found) file = path.join(outDir, "404.html");
    res.writeHead(found ? 200 : 404, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () =>
    console.log(`預覽：http://localhost:${port}${base}/　（${posts} 篇文章）`)
  );
