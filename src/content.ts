import fs from "node:fs";
import path from "node:path";
import { blocksToEditable, editableToBlocks, type SiteBlock } from "./blocks";
import { contentDir, DEFAULT_CATEGORY_NAME, isCategoryName } from "./config";

export type Post = {
  /** 檔名去掉 .md，也是文章網址：/<slug>/。通常由標題產生，例如「美国女子濒死时回顾一生-看尽自己此生善恶」。 */
  slug: string;
  title: string;
  /** ISO 時間，用來排序與顯示日期。 */
  date: string;
  category: string;
  tags: string[];
  excerpt: string;
  /** 首圖（/media/… 或 https://…）。 */
  image: string | null;
  /** 首圖下方的圖說。 */
  caption: string | null;
  source: string | null;
  draft: boolean;
  blocks: SiteBlock[];
};

/** 網站根目錄已經被其他頁面使用的名稱，文章不能用。 */
const RESERVED_SLUGS = new Set([
  "category",
  "search",
  "page",
  "media",
  "assets",
  "post",
  "404.html",
  "sitemap.xml",
  "robots.txt",
  "search-index.json",
]);
const BAD_SLUG_CHAR = /[\/\\?#%\s"'<>&]/;

export function isValidSlug(slug: string) {
  return (
    slug.length > 0 &&
    slug.length <= 200 &&
    !slug.startsWith(".") &&
    !slug.startsWith("-") &&
    !BAD_SLUG_CHAR.test(slug) &&
    !RESERVED_SLUGS.has(slug.toLowerCase())
  );
}

/**
 * 由標題產生網址：保留中文、英文與數字，空白換成連字號，其他標點去掉。
 * 例：「前NBA球星：“真善忍”将成为我的座右铭」→「前nba球星真善忍将成为我的座右铭」。
 */
export function titleSlug(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return isValidSlug(slug) ? slug : "post";
}

/** 找一個還沒被使用的檔名：重複時加上 -2、-3…… */
export function uniqueSlug(base: string, dir = contentDir()) {
  const folder = postsDir(dir);
  const taken = (slug: string) =>
    !isValidSlug(slug) || fs.existsSync(path.join(folder, `${slug}.md`));
  if (!taken(base)) return base;
  for (let n = 2; n < 1000; n += 1)
    if (!taken(`${base}-${n}`)) return `${base}-${n}`;
  throw new Error("同名文章太多了。");
}

const FIELD_ORDER = [
  "title",
  "date",
  "category",
  "tags",
  "image",
  "caption",
  "source",
  "excerpt",
  "draft",
] as const;

function oneLine(value: string) {
  return value.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * 文章檔格式：開頭兩條 --- 之間是「欄位: 值」，一行一個；之後是正文。
 * 刻意不用完整的 YAML，值就是冒號後面的整行文字，在 GitHub 網頁上手改也不容易出錯。
 */
export function parsePost(slug: string, text: string): Post {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(
    text.replace(/^﻿/, "")
  );
  if (!match) throw new Error(`${slug}.md 開頭缺少 --- 欄位區塊。`);
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([a-z]+)\s*:\s*(.*)$/.exec(line.trim());
    if (field) fields.set(field[1], field[2].trim());
  }
  const title = fields.get("title") ?? "";
  if (!title) throw new Error(`${slug}.md 沒有 title。`);
  const date = new Date(fields.get("date") ?? "");
  if (Number.isNaN(date.getTime()))
    throw new Error(`${slug}.md 的 date 不是正確的日期。`);
  const category = fields.get("category") ?? "";
  return {
    slug,
    title,
    date: date.toISOString(),
    category: isCategoryName(category) ? category : DEFAULT_CATEGORY_NAME,
    tags: (fields.get("tags") ?? "")
      .split(/[、,，]/)
      .map(tag => tag.trim())
      .filter(Boolean),
    excerpt: fields.get("excerpt") ?? "",
    image: fields.get("image") || null,
    caption: fields.get("caption") || null,
    source: fields.get("source") || null,
    draft: fields.get("draft") === "true",
    blocks: editableToBlocks(match[2]),
  };
}

export function serializePost(post: Omit<Post, "slug">) {
  const values: Record<(typeof FIELD_ORDER)[number], string> = {
    title: oneLine(post.title),
    date: post.date,
    category: post.category,
    tags: post.tags.map(oneLine).join("、"),
    image: post.image ?? "",
    caption: oneLine(post.caption ?? ""),
    source: post.source ?? "",
    excerpt: oneLine(post.excerpt),
    draft: post.draft ? "true" : "",
  };
  const lines = FIELD_ORDER.filter(
    key => values[key] || key === "tags" || key === "excerpt"
  ).map(key => `${key}: ${values[key]}`);
  return `---\n${lines.join("\n")}\n---\n\n${blocksToEditable(post.blocks)}\n`;
}

export function postsDir(dir = contentDir()) {
  return path.join(dir, "posts");
}
export function mediaDir(dir = contentDir()) {
  return path.join(dir, "media");
}

/** 讀取所有文章，新的在前。壞掉的檔案直接報錯，避免網站悄悄少一篇。 */
export function loadPosts(dir = contentDir()): Post[] {
  const folder = postsDir(dir);
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter(name => name.endsWith(".md"))
    .map(name => {
      const slug = name.slice(0, -3);
      if (!isValidSlug(slug))
        throw new Error(
          `文章檔名 ${name} 不能含空白、斜線、引號、? # % & < >，也不能是網站保留的名稱。`
        );
      return parsePost(slug, fs.readFileSync(path.join(folder, name), "utf8"));
    })
    .sort(
      (a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug)
    );
}
