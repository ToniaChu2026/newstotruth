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

/** 搜尋引擎在 robots.txt 裡的名稱。 */
export const SEARCH_ENGINE_AGENTS = {
  baidu: "Baiduspider",
  yandex: "Yandex",
  google: "Googlebot",
  bing: "Bingbot",
} as const;
export type SearchEngine = keyof typeof SEARCH_ENGINE_AGENTS;

/** 這個搜尋引擎可不可以收錄本站。 */
export function mayIndex(config: SiteConfig, engine: SearchEngine) {
  return !config.searchEngines || config.searchEngines.includes(engine);
}

export type SiteConfig = {
  name: string;
  tagline: string;
  description: string;
  pageSize: number;
  /** 首頁最多幾頁（只放最新的文章）；較舊的文章從分類頁與搜尋找。0 表示不限。 */
  homePages: number;
  /** 顯示日期與產生檔名時使用的時區。 */
  timeZone: string;
  /** 頁首的標誌圖（/media/… 或 https://…）；沒有就顯示文字站名。 */
  logo?: string;
  /** 首頁最上方的橫幅圖；設定後首頁不再把最新一篇放大成頭條。 */
  hero?: { image: string; alt?: string; link?: string };
  /** 網站正式網址，例如 https://news-focus.org；用在 canonical、分享預覽、sitemap 與 RSS。 */
  url?: string;
  /**
   * 只讓這些搜尋引擎收錄（baidu、yandex、google、bing）；不設定時所有搜尋引擎都可收錄。
   * 不在清單裡的 Google、Bing 仍可抓取但每頁標 noindex（才會從結果移除），其他搜尋引擎由 robots.txt 擋掉。
   */
  searchEngines?: SearchEngine[];
  /** Google Tag Manager 容器編號，例如 GTM-P5R8TSN；GA 等追蹤都在 GTM 裡設定。 */
  gtm?: string;
};

const DEFAULTS: SiteConfig = {
  name: "新闻聚焦",
  tagline: "",
  description: "",
  pageSize: 12,
  homePages: 0,
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
    homePages: Math.max(0, Math.floor(Number(raw.homePages) || 0)),
    url:
      raw.url && /^https?:\/\/[^/\s]+(\/\S*)?$/.test(raw.url)
        ? raw.url.replace(/\/+$/, "")
        : undefined,
    searchEngines: Array.isArray(raw.searchEngines)
      ? raw.searchEngines.filter(
          (name): name is SearchEngine => name in SEARCH_ENGINE_AGENTS
        )
      : undefined,
    gtm: raw.gtm && /^GTM-[A-Z0-9]+$/.test(raw.gtm) ? raw.gtm : undefined,
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
