import fs from "node:fs";
import path from "node:path";
import { blocksToEditable, editableToBlocks, type SiteBlock } from "./blocks";
import {
  contentDir,
  dayInTimeZone,
  DEFAULT_CATEGORY_NAME,
  isCategoryName,
  loadSiteConfig,
} from "./config";

export type Post = {
  /** 檔名去掉 .md，同時是文章網址的一部分，例如 2026-11-10-01。 */
  slug: string;
  title: string;
  /** ISO 時間，用來排序與顯示日期。 */
  date: string;
  category: string;
  tags: string[];
  excerpt: string;
  /** 首圖（/media/… 或 https://…）。 */
  image: string | null;
  source: string | null;
  draft: boolean;
  blocks: SiteBlock[];
};

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const FIELD_ORDER = [
  "title",
  "date",
  "category",
  "tags",
  "image",
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
      if (!SLUG.test(slug))
        throw new Error(`文章檔名 ${name} 只能用小寫英文、數字與連字號。`);
      return parsePost(slug, fs.readFileSync(path.join(folder, name), "utf8"));
    })
    .sort(
      (a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug)
    );
}

/** 依日期產生下一個可用的檔名：2026-11-10-01、2026-11-10-02… */
export function nextSlug(date: Date, dir = contentDir()) {
  const day = dayInTimeZone(date, loadSiteConfig(dir).timeZone);
  const folder = postsDir(dir);
  const taken = fs.existsSync(folder)
    ? new Set(fs.readdirSync(folder))
    : new Set();
  for (let n = 1; n < 1000; n += 1) {
    const slug = `${day}-${String(n).padStart(2, "0")}`;
    if (!taken.has(`${slug}.md`)) return slug;
  }
  throw new Error("同一天的文章太多了。");
}
