import { createHash } from "node:crypto";
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

/**
 * 圖片伺服器不給原圖時回傳的佔位圖（內容的 MD5）。
 * 看中国的「看中國 SECRETCHINA.COM」橋景圖有 JPEG 與 WebP 兩種版本。
 */
const PLACEHOLDER_IMAGES = new Set([
  "a5586c68f61477675d420fc285cd115f",
  "13f32ee705b80cc3f970d4886acf5032",
]);

export type ExtractedImage = {
  url: string;
  altText: string;
  index: number;
  /**
   * 原文網頁 HTML 裡屬於這張圖的圖說（figcaption、caption 類別的元素，
   * 或和圖片在同一段、用 <br> 隔開的文字）；確定沒有時是 null。
   */
  caption?: string | null;
};

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

const NAMED_ENTITIES: Record<string, string> = {
  middot: "·",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  bull: "•",
  times: "×",
  copy: "©",
  reg: "®",
  deg: "°",
  laquo: "«",
  raquo: "»",
};

export function decodeHtml(value: string) {
  return value
    .replace(/&([a-z]+);/gi, (all, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? all
    )
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

/** 網域的最後兩段，用來判斷兩個網址是不是同一個網站（img6.example.com 和 www.example.com 算同一個）。 */
function siteOf(hostname: string) {
  return hostname.toLowerCase().split(".").slice(-2).join(".");
}

/**
 * 圖片外面包著連到別的網站的連結：是廣告或推廣圖，不是文章的圖
 * （例如看中国每篇正文中間插的 <a href="https://廣告主"><img …></a>）。
 * 連到同一個網站或直接連到圖檔（點擊放大）的不算。
 */
export function linksOffsite(html: string, imgStart: number, baseUrl: string) {
  const before = html.slice(Math.max(0, imgStart - 1000), imgStart);
  const anchors = Array.from(before.matchAll(/<a\b[^>]*>/gi));
  const open = anchors[anchors.length - 1];
  if (!open || before.slice(open.index).includes("</a")) return false;
  const href = readAttribute(open[0], "href");
  if (!href) return false;
  try {
    const target = new URL(href, baseUrl);
    if (!["http:", "https:"].includes(target.protocol)) return false;
    if (/\.(jpe?g|png|gif|webp|avif)$/i.test(target.pathname)) return false;
    return siteOf(target.hostname) !== siteOf(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

function imageSource(tag: string) {
  const raw =
    readAttribute(tag, "data-src") ||
    readAttribute(tag, "data-lazy-src") ||
    readAttribute(tag, "data-original") ||
    readAttribute(tag, "src");
  return raw && !raw.startsWith("data:") ? raw : "";
}

/** HTML 片段轉成一行文字（拿掉隱藏元素）。 */
function inlineText(html: string) {
  return decodeHtml(
    html
      .replace(
        /<(\w+)\b[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^>]*>[\s\S]*?<\/\1>/gi,
        " "
      )
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

const CAPTION_CLASS =
  /<(figcaption|div|p|span|small|em)\b[^>]*class\s*=\s*["'][^"']*caption[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i;
const BLOCK_END = /<\/(p|td|center|div|li|figure|h[1-6]|table|section|article)\s*>/i;

/**
 * 依原文網頁的 HTML 結構找圖說：
 * 1. 同一個 <figure> 裡的 <figcaption>；
 * 2. 圖片後面（中間沒有其他文字）帶 caption 類別的元素，例如大纪元的 imageCaption；
 * 3. 緊跟在圖片後面、自成一個元素且外層區塊隨即結束的文字，例如人民报；
 * 4. 和圖片在同一段（<p>、<td>、<center>…）且用 <br> 隔開的文字，例如看中国、明慧网。
 * 都不是就回傳 null：圖片後面另起一段的文字是正文，不是圖說。
 */
export function captionFromHtml(html: string, imgStart: number, imgEnd: number) {
  const valid = (text: string) =>
    text.length >= 2 && text.length <= 300 ? text : null;
  // 1. figure / figcaption
  const before = html.slice(0, imgStart);
  const figureOpen = before.lastIndexOf("<figure");
  if (figureOpen !== -1 && figureOpen > before.lastIndexOf("</figure")) {
    const figureClose = html.indexOf("</figure", imgEnd);
    const inside = html.slice(imgEnd, figureClose === -1 ? imgEnd + 3000 : figureClose);
    const caption = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(inside);
    if (caption) return valid(inlineText(caption[1]));
  }
  // <noscript> 裡通常是同一張圖的備用標籤，不算下一張圖。
  const rest = html
    .slice(imgEnd, imgEnd + 4000)
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
  const nextImg = rest.search(/<img\b/i);
  const after = rest.slice(0, Math.min(nextImg === -1 ? 3000 : nextImg, 3000));
  // 2. caption 類別的元素，前面沒有其他文字
  const classed = CAPTION_CLASS.exec(after);
  if (classed && !inlineText(after.slice(0, classed.index)))
    return valid(inlineText(classed[2]));
  // 3. 緊跟在圖片後面、自成一個元素的文字，而且外層的區塊就在它後面結束
  //    （例如人民报：<center><img><div>圖說</div></center>）
  const own =
    /^\s*(?:<\/a>\s*)?(?:<br\s*\/?>\s*)?<(div|span|font|small|em|i|strong|b|p)\b[^>]*>([\s\S]*?)<\/\1>\s*<\/(center|td|figure|p|div|li)>/i.exec(
      after
    );
  if (own && !/<(img|p|div)\b/i.test(own[2])) {
    const text = inlineText(own[2]);
    if (text) return valid(text);
  }
  // 4. 同一段裡、<br> 之後的文字
  const blockEnd = after.search(BLOCK_END);
  const block = blockEnd === -1 ? "" : after.slice(0, blockEnd);
  const br = block.search(/<br\b/i);
  if (br !== -1 && !inlineText(block.slice(0, br))) {
    const text = inlineText(block.slice(br));
    if (text) return valid(text);
  }
  return null;
}

/** 擷取文章內的圖片候選；略過明顯的裝飾性小圖。 */
export function extractImages(
  html: string,
  baseUrl: string,
  maxImages = MAX_IMAGES
) {
  const found: ExtractedImage[] = [];
  const seen = new Set<string>();
  const imageTags = Array.from(html.matchAll(/<img\b[^>]*>/gi), match => ({
    tag: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  const ogImage = readMeta(html, "og:image");
  const candidateTags = [
    ...imageTags,
    ...((imageTags.length === 0 &&
      ogImage && [{ tag: `<img src="${ogImage}" alt="">`, start: -1, end: -1 }]) ||
      []),
  ];
  for (const { tag, start, end } of candidateTags) {
    if (found.length >= maxImages) break;
    const raw = imageSource(tag);
    if (!raw) continue;
    try {
      const url = new URL(raw, baseUrl).toString();
      if (!["http:", "https:"].includes(new URL(url).protocol) || seen.has(url))
        continue;
      if (looksDecorative(tag, url)) continue;
      if (start !== -1 && linksOffsite(html, start, baseUrl)) continue;
      seen.add(url);
      found.push({
        url,
        altText: readAttribute(tag, "alt").slice(0, 320),
        index: found.length,
        caption: start === -1 ? null : captionFromHtml(html, start, end),
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
  const captions = Array.isArray(candidate.captions)
    ? candidate.captions
        .filter(
          item => item && typeof item.text === "string" && item.text.trim()
        )
        .map(item => ({ image: Number(item.image), text: item.text.trim() }))
    : [];
  return { title, summary, content, category, tags, captions };
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
    if (PLACEHOLDER_IMAGES.has(createHash("md5").update(bytes).digest("hex")))
      throw new Error("來源回傳的是佔位圖，不是文章的圖片。");
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
