import { lookup } from "node:dns/promises";
import { DEFAULT_CATEGORY_NAME, isCategoryName } from "../config";
import {
  aiArticleSchema,
  structureWithClaude,
  type AiArticle,
  type StructureFn,
} from "./ai";

const MAX_PAGE_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const MIN_IMAGE_BYTES = 8_000;
const MAX_IMAGES = 8;
const USER_AGENT =
  "NewsToTruth-Authorized-Import/1.0 (+authorized-content-only)";

export type ExtractedImage = { url: string; altText: string; index: number };

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  )
    return true;
  if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.slice(7));
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return false;
  const [a, b] = normalized.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export async function validatePublicImportUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("請輸入正確的文章網址。");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("只能匯入 http 或 https 網址。");
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost"))
    throw new Error("不能匯入本機網址。");
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error("無法解析文章網址的主機。");
  }
  if (!addresses.length || addresses.some(item => isPrivateIp(item.address)))
    throw new Error("只能匯入公開網站的網址。");
  return parsed;
}

export async function fetchPublicPage(inputUrl: string) {
  let current = await validatePublicImportUrl(inputUrl);
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("文章網址轉址後沒有目的地。");
      current = await validatePublicImportUrl(
        new URL(location, current).toString()
      );
      continue;
    }
    if (!response.ok)
      throw new Error(`無法抓取來源網頁（HTTP ${response.status}）。`);
    if (
      !response.headers.get("content-type")?.toLowerCase().includes("text/html")
    )
      throw new Error("這個網址回傳的不是 HTML 文章頁。");
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_PAGE_BYTES)
      throw new Error("來源網頁太大，無法匯入。");
    const html = await response.text();
    return {
      html: html.slice(0, MAX_PAGE_BYTES),
      finalUrl: current.toString(),
    };
  }
  throw new Error("文章網址轉址次數過多。");
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, entity: string) =>
      String.fromCodePoint(
        entity.startsWith("x")
          ? parseInt(entity.slice(1), 16)
          : parseInt(entity, 10)
      )
    );
}

export function htmlToReadableText(html: string) {
  return decodeHtml(
    html
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
      .replace(
        /<(script|style|noscript|template|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi,
        " "
      )
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<\/(p|div|article|section|h[1-6]|li|blockquote|br|figure|figcaption|tr)[^>]*>/gi,
        "\n"
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim()
  );
}

function readAttribute(tag: string, name: string) {
  const result = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  ).exec(tag);
  return decodeHtml(result?.[1] || result?.[2] || result?.[3] || "");
}

function readMeta(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const found = tags.find(tag =>
    [readAttribute(tag, "property"), readAttribute(tag, "name")].some(
      value => value.toLowerCase() === key.toLowerCase()
    )
  );
  return found ? readAttribute(found, "content") : "";
}

const DECORATIVE_URL =
  /(logo|icon|avatar|gravatar|emoji|spacer|pixel|sprite|badge|button|\/ads?\/)/i;

function looksDecorative(tag: string, url: string) {
  if (DECORATIVE_URL.test(url)) return true;
  const width = Number(readAttribute(tag, "width"));
  const height = Number(readAttribute(tag, "height"));
  if ((width && width < 120) || (height && height < 120)) return true;
  return false;
}

function imageSource(tag: string) {
  const raw =
    readAttribute(tag, "data-src") ||
    readAttribute(tag, "data-lazy-src") ||
    readAttribute(tag, "data-original") ||
    readAttribute(tag, "src");
  return raw && !raw.startsWith("data:") ? raw : "";
}

/** 擷取文章內的圖片候選；略過明顯的裝飾性小圖。 */
export function extractImages(html: string, baseUrl: string) {
  const found: ExtractedImage[] = [];
  const seen = new Set<string>();
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  const ogImage = readMeta(html, "og:image");
  const candidateTags = [
    ...imageTags,
    ...((imageTags.length === 0 &&
      ogImage && [`<img src="${ogImage}" alt="">`]) ||
      []),
  ];
  for (const tag of candidateTags) {
    if (found.length >= MAX_IMAGES) break;
    const raw = imageSource(tag);
    if (!raw) continue;
    try {
      const url = new URL(raw, baseUrl).toString();
      if (!["http:", "https:"].includes(new URL(url).protocol) || seen.has(url))
        continue;
      if (looksDecorative(tag, url)) continue;
      seen.add(url);
      found.push({
        url,
        altText: readAttribute(tag, "alt").slice(0, 320),
        index: found.length,
      });
    } catch {
      // 忽略格式錯誤的圖片網址，繼續處理文章。
    }
  }
  return found;
}

/** 轉成純文字並在圖片原位置放入 {{image:n}} 標記。 */
export function htmlToReadableTextWithImageMarkers(
  html: string,
  baseUrl: string,
  images = extractImages(html, baseUrl)
) {
  const imageByUrl = new Map(images.map(image => [image.url, image] as const));
  const markedHtml = html.replace(/<img\b[^>]*>/gi, tag => {
    const raw = imageSource(tag);
    if (!raw) return " ";
    try {
      const image = imageByUrl.get(new URL(raw, baseUrl).toString());
      return image ? `\n\n{{image:${image.index}}}\n\n` : " ";
    } catch {
      return " ";
    }
  });
  const readable = htmlToReadableText(markedHtml);
  // 只有 Open Graph 圖片時沒有內文位置，當作首圖。
  return images.length && !/\{\{image:\d+\}\}/.test(readable)
    ? `{{image:${images[0].index}}}\n\n${readable}`
    : readable;
}

export function metaTitle(html: string) {
  return (
    readMeta(html, "og:title") ||
    decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "").trim()
  );
}

export function normalizeAiArticle(
  value: unknown,
  fallbackTitle: string,
  sourceMarkers: string[]
): AiArticle {
  const parsed = aiArticleSchema.safeParse(value);
  const candidate =
    (parsed.success ? parsed.data : (value as Partial<AiArticle>)) ?? {};
  const title = String(candidate.title || fallbackTitle || "匯入的文章")
    .trim()
    .slice(0, 320);
  const content = String(candidate.content || "")
    .trim()
    .slice(0, 450_000);
  const summary = String(
    candidate.summary ||
      content
        .replace(/\{\{image:\d+\}\}/g, "")
        .trim()
        .slice(0, 200) ||
      title
  )
    .trim()
    .slice(0, 2_000);
  const categoryName = String(candidate.category || "").trim();
  const category = isCategoryName(categoryName)
    ? categoryName
    : DEFAULT_CATEGORY_NAME;
  const tags = Array.isArray(candidate.tags)
    ? candidate.tags
        .map(tag => String(tag).trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  if (content.length < 24)
    throw new Error("來源沒有足夠的文章內文可以建立文章。");
  // 標記可以被刪掉（裝飾性圖片），但不能憑空多出來，也不能調換順序。
  const kept = (content.match(/\{\{image:\d+\}\}/g) || []).filter(
    (marker, index, all) => all.indexOf(marker) === index
  );
  let sourcePosition = -1;
  for (const marker of kept) {
    sourcePosition = sourceMarkers.indexOf(marker, sourcePosition + 1);
    if (sourcePosition === -1)
      throw new Error("整理後的圖片標記和來源對不上，請再試一次。");
  }
  return { title, summary, content, category, tags };
}

export async function structureArticle(
  sourceUrl: string,
  sourceText: string,
  fallbackTitle: string,
  structure: StructureFn = structureWithClaude
) {
  const clippedSource = sourceText.slice(0, 120_000);
  if (clippedSource.replace(/\{\{image:\d+\}\}/g, "").trim().length < 80)
    throw new Error("來源沒有足夠的可讀文字可以匯入。");
  const sourceMarkers = Array.from(
    new Set(clippedSource.match(/\{\{image:\d+\}\}/g) || [])
  );
  const raw = await structure({
    sourceUrl,
    sourceText: clippedSource,
    fallbackTitle,
  });
  return normalizeAiArticle(raw, fallbackTitle, sourceMarkers);
}

function extensionFromContentType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("avif")) return "avif";
  return "jpg";
}

export async function downloadImage(candidate: ExtractedImage) {
  let current = await validatePublicImportUrl(candidate.url);
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("圖片轉址後沒有目的地。");
      current = await validatePublicImportUrl(
        new URL(location, current).toString()
      );
      continue;
    }
    if (!response.ok)
      throw new Error(`圖片下載失敗（HTTP ${response.status}）。`);
    const contentType =
      response.headers
        .get("content-type")
        ?.toLowerCase()
        .split(";")[0]
        .trim() || "";
    if (!contentType.startsWith("image/") || contentType.includes("svg"))
      throw new Error("來源不是支援的點陣圖片。");
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) throw new Error("圖片超過大小上限。");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
      throw new Error("圖片超過大小上限。");
    if (bytes.length < MIN_IMAGE_BYTES) throw new Error("圖片太小，略過。");
    return {
      bytes,
      contentType,
      extension: extensionFromContentType(contentType),
    };
  }
  throw new Error("圖片轉址次數過多。");
}

export function retainPersistedImageMarkers(
  content: string,
  persistedImageIndexes: number[]
) {
  const persisted = new Set(persistedImageIndexes);
  return content
    .replace(/\{\{image:(\d+)\}\}/g, (marker, rawIndex: string) =>
      persisted.has(Number(rawIndex)) ? marker : ""
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 列出內容中圖片標記的出現順序（去重）。 */
export function markerOrder(content: string) {
  const order: number[] = [];
  for (const match of content.matchAll(/\{\{image:(\d+)\}\}/g)) {
    const index = Number(match[1]);
    if (!order.includes(index)) order.push(index);
  }
  return order;
}
