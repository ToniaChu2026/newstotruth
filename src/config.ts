import fs from "node:fs";
import path from "node:path";

/** 網站的七個固定分類；slug 用在網址裡。 */
export const CATEGORIES = [
  { name: "聚焦", slug: "focus" },
  { name: "述评", slug: "commentary" },
  { name: "最新", slug: "news" },
  { name: "特稿", slug: "featured" },
  { name: "感悟", slug: "inspired" },
  { name: "文化", slug: "culture" },
  { name: "历史", slug: "history" },
] as const;

export const CATEGORY_NAMES = [
  "聚焦",
  "述评",
  "最新",
  "特稿",
  "感悟",
  "文化",
  "历史",
] as const;
export type CategoryName = (typeof CATEGORY_NAMES)[number];
export const DEFAULT_CATEGORY_NAME: CategoryName = "最新";

export function isCategoryName(value: string): value is CategoryName {
  return (CATEGORY_NAMES as readonly string[]).includes(value);
}
export function categorySlug(name: string) {
  return CATEGORIES.find(category => category.name === name)?.slug ?? "news";
}

export type SiteConfig = {
  name: string;
  tagline: string;
  description: string;
  pageSize: number;
  /** 顯示日期與產生檔名時使用的時區。 */
  timeZone: string;
};

const DEFAULTS: SiteConfig = {
  name: "新闻聚焦",
  tagline: "",
  description: "",
  pageSize: 12,
  timeZone: "Asia/Shanghai",
};

/** 文章、圖片與網站設定所在的資料夾；測試與預覽時可用 CONTENT_DIR 換掉。 */
export function contentDir() {
  return path.resolve(process.env.CONTENT_DIR || "content");
}

export function loadSiteConfig(dir = contentDir()): SiteConfig {
  const file = path.join(dir, "site.json");
  if (!fs.existsSync(file)) return DEFAULTS;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<SiteConfig>;
  return {
    ...DEFAULTS,
    ...raw,
    pageSize: Math.max(
      1,
      Math.min(Number(raw.pageSize) || DEFAULTS.pageSize, 60)
    ),
  };
}

/** 指定時區下的日期，格式 2026-11-10。 */
export function dayInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
