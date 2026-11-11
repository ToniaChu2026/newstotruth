/**
 * 新增文章的指令。
 *
 *   pnpm article fetch <網址>            抓取網頁，把文字與圖片清單存到 .import/source.json
 *   pnpm article add <整理好的.json>      下載圖片並寫成 content/posts/*.md
 *   pnpm article auto <網址>             抓取後直接呼叫 Claude API 整理（需要 ANTHROPIC_API_KEY）
 *
 * add 與 auto 可加 --draft：寫成草稿，不會出現在網站上。
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  addArticle,
  fetchSource,
  findBySource,
  importWithApi,
  type AddResult,
  type FetchedSource,
} from "../src/importer/add";

const WORK_DIR = ".import";
const SOURCE_FILE = path.join(WORK_DIR, "source.json");

function report(result: AddResult) {
  const file = path.relative(process.cwd(), result.file);
  if (result.duplicate) {
    console.log(`這個來源先前已經加入過：${file}（${result.title}）`);
    return;
  }
  console.log(`已寫入 ${file}`);
  console.log(`標題：${result.title}`);
  console.log(
    `分類：${result.category}　標籤：${result.tags.join("、") || "無"}`
  );
  console.log(
    `圖片：${result.imageCount} 張${result.skippedImages ? `，略過 ${result.skippedImages} 張` : ""}`
  );
  console.log(`網址：/post/${result.slug}/`);
}

async function main() {
  const args = process.argv.slice(2);
  const draft = args.includes("--draft");
  const [command, target] = args.filter(arg => !arg.startsWith("--"));

  if (command === "fetch" && target) {
    const existing = findBySource(target.trim());
    if (existing) {
      console.log(
        `這個來源先前已經加入過：content/posts/${existing.slug}.md（${existing.title}）`
      );
      return;
    }
    const source = await fetchSource(target);
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(SOURCE_FILE, JSON.stringify(source, null, 2));
    console.log(`已存到 ${SOURCE_FILE}`);
    console.log(`網頁標題：${source.pageTitle}`);
    console.log(`文字長度：${source.text.length} 字`);
    console.log("圖片：");
    for (const image of source.images)
      console.log(
        `  {{image:${image.index}}} ${image.altText || "（無說明）"} ${image.url}`
      );
    if (!source.images.length) console.log("  （沒有）");
    return;
  }

  if (command === "add" && target) {
    if (!fs.existsSync(SOURCE_FILE))
      throw new Error(`找不到 ${SOURCE_FILE}，請先執行 fetch。`);
    const source = JSON.parse(
      fs.readFileSync(SOURCE_FILE, "utf8")
    ) as FetchedSource;
    const structured = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
    report(await addArticle(source, structured, { draft }));
    return;
  }

  if (command === "auto" && target) {
    report(await importWithApi(target, { draft }));
    return;
  }

  console.log(
    "用法：\n  pnpm article fetch <網址>\n  pnpm article add <整理好的.json> [--draft]\n  pnpm article auto <網址> [--draft]"
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
