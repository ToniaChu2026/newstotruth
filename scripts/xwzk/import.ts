/**
 * 匯入「真相聚焦 新闻周刊」的文章。
 *
 * 1. 先拆 docx：python3 -I scripts/xwzk/extract_docx.py <輸出資料夾> <docx...>
 * 2. 再匯入：corepack pnpm -s exec tsx scripts/xwzk/import.ts <輸出資料夾> [分類.json] [--issue 2026-05-31]
 *
 * 正文用 docx 的文字；圖片與圖說從原文链接取，抓不到時改用 docx 內的圖片。
 * 第一輪抓所有原文網頁（存在 <輸出資料夾>/pages/ 供重跑使用），
 * 出現在 5 篇以上不同文章裡的同一張圖視為網站廣告（例如看中國每篇都插的推廣圖），不採用；
 * 兩三篇共用的通常是同一張新聞資料照，照常採用；第二輪才下載圖片、寫文章。
 * 日期用 docx 檔名的那一期，同一期依目录順序排列。已存在的文章（同來源）會略過。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  contentDir,
  DEFAULT_CATEGORY_NAME,
  isCategoryName,
} from "../../src/config";
import {
  mediaDir,
  postsDir,
  serializePost,
  titleSlug,
  uniqueSlug,
} from "../../src/content";
import {
  fetchSource,
  findBySource,
  mediaPrefix,
  type FetchedSource,
} from "../../src/importer/add";
import { downloadImage } from "../../src/importer/fetch";
import { saveCompactImage } from "../../src/importer/images";
import {
  assembleBlocks,
  excerptFrom,
  placeSourceImages,
  type DocxArticle,
  type PlacedImage,
  type ResolvedImage,
} from "../../src/importer/xwzk";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * epochtimes 等網站經由 /_next/image?url=…&w=… 提供縮圖；網頁上的寬度常常太小，
 * 原圖又可能超過下載上限，所以統一要 1200 像素寬的版本。
 */
function sizedImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (
      parsed.pathname.endsWith("/_next/image") &&
      parsed.searchParams.get("url")
    ) {
      parsed.searchParams.set("w", "1200");
      parsed.searchParams.set("q", "80");
      return parsed.toString();
    }
  } catch {
    // 保持原樣
  }
  return url;
}

async function fetchCached(url: string, cacheDir: string) {
  const base = path.join(
    cacheDir,
    createHash("sha1").update(url).digest("hex")
  );
  if (fs.existsSync(`${base}.json`))
    return JSON.parse(fs.readFileSync(`${base}.json`, "utf8")) as FetchedSource;
  // 之前已經確定抓不到的網頁不再重試；刪掉 .error 檔即可重抓。
  if (fs.existsSync(`${base}.error`))
    throw new Error(fs.readFileSync(`${base}.error`, "utf8"));
  for (let attempt = 1; ; attempt += 1) {
    try {
      const source = await fetchSource(url, undefined, 60);
      fs.writeFileSync(`${base}.json`, JSON.stringify(source));
      await sleep(400);
      return source;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt >= 3 ||
        !/429|50\d|timeout|aborted|fetch failed/i.test(message)
      ) {
        fs.writeFileSync(`${base}.error`, message);
        throw error;
      }
      await sleep(attempt * 20_000);
    }
  }
}

/** 同一張圖出現在這麼多篇不同文章裡，就當作網站廣告。 */
const SHARED_AD_MIN = 5;

type Plan = {
  article: DocxArticle;
  placed: Array<PlacedImage & { url: string; alt: string }>;
  fetchError: string | null;
};

async function main() {
  const args = process.argv.slice(2);
  const issueFlag = args.indexOf("--issue");
  const onlyIssue = issueFlag !== -1 ? args[issueFlag + 1] : null;
  const [outDir, categoriesFile] = args.filter(
    (arg, index) =>
      !arg.startsWith("--") && (issueFlag === -1 || index !== issueFlag + 1)
  );
  if (!outDir)
    throw new Error(
      "用法：import.ts <輸出資料夾> [分類.json] [--issue 2026-05-31]"
    );
  const articles = JSON.parse(
    fs.readFileSync(path.join(outDir, "articles.json"), "utf8")
  ) as DocxArticle[];
  const categories: Record<string, string> = categoriesFile
    ? JSON.parse(fs.readFileSync(categoriesFile, "utf8"))
    : {};
  const dir = contentDir();
  const cacheDir = path.join(outDir, "pages");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(postsDir(dir), { recursive: true });
  fs.mkdirSync(mediaDir(dir), { recursive: true });

  // 廣告判定要看全部文章，所以這一輪一律看所有期數。
  const all = [...articles].sort(
    (a, b) => a.issue.localeCompare(b.issue) || a.order - b.order
  );

  // 第一輪：抓網頁、對齊圖片位置。
  const plans: Plan[] = [];
  for (const [n, article] of all.entries()) {
    let fetchError: string | null = null;
    let placed: Plan["placed"] = [];
    try {
      const source = await fetchCached(article.source, cacheDir);
      const urls = source.images.map(image => sizedImageUrl(image.url));
      const found = placeSourceImages(
        article,
        source.text,
        10,
        urls,
        source.images.map(image => image.caption)
      );
      if (found === null) fetchError = "原文網頁裡找不到對應的正文";
      placed = (found ?? []).map(image => ({
        ...image,
        url: urls[image.index],
        alt:
          image.caption ??
          (source.images[image.index].altText || article.title),
      }));
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error);
    }
    plans.push({ article, placed, fetchError });
    if ((n + 1) % 25 === 0) console.log(`已抓取 ${n + 1}/${all.length} 篇原文`);
  }

  const usedBy = new Map<string, Set<string>>();
  for (const plan of plans)
    for (const image of plan.placed) {
      if (!usedBy.has(image.url)) usedBy.set(image.url, new Set());
      usedBy.get(image.url)!.add(plan.article.source);
    }
  const shared = new Set(
    [...usedBy]
      .filter(([, sources]) => sources.size >= SHARED_AD_MIN)
      .map(([url]) => url)
  );
  console.log(
    `共用圖片（${SHARED_AD_MIN} 篇以上，視為廣告，不採用）：${shared.size} 張`
  );

  // 第二輪：下載圖片、寫文章。
  const report: Array<Record<string, unknown>> = [];
  for (const plan of plans) {
    const { article } = plan;
    if (onlyIssue && article.issue !== onlyIssue) continue;
    const label = `${article.issue} #${article.order + 1} ${article.title}`;
    if (findBySource(article.source, dir)) {
      console.log(`略過（已存在）：${label}`);
      continue;
    }
    // 同一期裡，目录越前面的時間越晚，首頁上就排在越前面。
    const date = new Date(
      new Date(`${article.issue}T12:00:00+08:00`).getTime() -
        article.order * 60_000
    );
    const prefix = mediaPrefix(article.title, date, dir);
    let count = 0;
    const save = (bytes: Buffer, extension: string) => {
      count += 1;
      const name = saveCompactImage(
        path.join(mediaDir(dir), `${prefix}-${count}.${extension}`),
        bytes
      );
      return `/media/${name}`;
    };

    const resolved: Array<ResolvedImage & { after: number; replaces?: number }> =
      [];
    for (const image of plan.placed) {
      if (shared.has(image.url)) continue;
      try {
        const file = await downloadImage({
          url: image.url,
          altText: image.alt,
          index: image.index,
        });
        resolved.push({
          url: save(file.bytes, file.extension),
          alt: image.alt,
          caption: image.caption,
          after: image.after,
          replaces: image.replaces,
        });
      } catch {
        // 單張圖片失敗就略過。
      }
    }
    let mode = resolved.length ? "source" : "none";
    if (!resolved.length) {
      // 原文沒有可用圖片時，改用 docx 內的圖片與「图N：」圖說。
      const firstText = article.blocks.findIndex(
        block => block.type === "p" || block.type === "h"
      );
      article.blocks.forEach((block, index) => {
        if (block.type !== "img") return;
        const file = path.join(outDir, block.file);
        if (!fs.existsSync(file)) return;
        const extension = path
          .extname(block.file)
          .slice(1)
          .toLowerCase()
          .replace("jpeg", "jpg");
        resolved.push({
          url: save(fs.readFileSync(file), extension),
          alt: block.caption ?? article.title,
          caption: block.caption,
          after: index < firstText ? -1 : index - 1,
        });
      });
      if (resolved.length) mode = "docx";
    }

    const { blocks, featured } = assembleBlocks(article.blocks, resolved);
    const category = categories[article.source];
    const slug = uniqueSlug(titleSlug(article.title), dir);
    fs.writeFileSync(
      path.join(postsDir(dir), `${slug}.md`),
      serializePost({
        title: article.title,
        date: date.toISOString(),
        category:
          category && isCategoryName(category)
            ? category
            : DEFAULT_CATEGORY_NAME,
        tags: [],
        excerpt: excerptFrom(article.blocks),
        image: featured?.url ?? null,
        caption: featured?.caption ?? null,
        source: article.source,
        draft: false,
        blocks,
      })
    );
    const captioned = resolved.filter(image => image.caption).length;
    const how =
      mode === "source" ? "原文圖片" : mode === "docx" ? "docx 圖片" : "無圖片";
    console.log(
      `已加入：${label}（${how} ${resolved.length} 張，圖說 ${captioned}${plan.fetchError ? `；原文：${plan.fetchError}` : ""}）`
    );
    report.push({
      issue: article.issue,
      order: article.order,
      title: article.title,
      slug,
      source: article.source,
      mode,
      images: resolved.length,
      captions: captioned,
      fetchError: plan.fetchError,
    });
  }
  fs.writeFileSync(
    path.join(outDir, "import-report.json"),
    JSON.stringify(report, null, 1)
  );
  console.log(`完成：新增 ${report.length} 篇。`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
