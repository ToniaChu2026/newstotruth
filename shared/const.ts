export const COOKIE_NAME = "ntt_importer_session";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const UNAUTHED_ERR_MSG = "請先登入 (10001)";
export const NOT_ADMIN_ERR_MSG = "沒有權限 (10002)";

/** newstotruth.com 的分類名稱與 WordPress 分類 ID 對照（2026-10-22 探測）。 */
export const WP_CATEGORIES = [
  { id: 11, name: "聚焦", slug: "focus" },
  { id: 12, name: "述评", slug: "commentary" },
  { id: 4, name: "最新", slug: "news" },
  { id: 13, name: "特稿", slug: "featured" },
  { id: 1, name: "感悟", slug: "inspired" },
  { id: 15, name: "文化", slug: "%e6%96%87%e5%8c%96" },
  { id: 17, name: "历史", slug: "%e5%8e%86%e5%8f%b2" },
] as const;

export const WP_CATEGORY_NAMES = [
  "聚焦",
  "述评",
  "最新",
  "特稿",
  "感悟",
  "文化",
  "历史",
] as const;
export type WpCategoryName = (typeof WP_CATEGORY_NAMES)[number];
export function categoryIdByName(name: string) {
  return WP_CATEGORIES.find(category => category.name === name)?.id ?? null;
}
export const DEFAULT_CATEGORY_NAME: WpCategoryName = "最新";

export const IMPORT_STAGES = ["fetch", "structure", "images", "draft"] as const;
export type ImportStage = (typeof IMPORT_STAGES)[number];
export const IMPORT_STAGE_LABELS: Record<ImportStage, string> = {
  fetch: "抓取網頁",
  structure: "AI 整理",
  images: "上傳圖片",
  draft: "建立草稿",
};
