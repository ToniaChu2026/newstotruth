/**
 * 「真相聚焦 新闻周刊」文章匯入：正文用 docx 裡的文字（已是簡體、含小標題），
 * 圖片與圖說從原文链接的網頁取，依段落對齊放回正文對應位置。
 */
import type { SiteBlock } from "../blocks";

export type DocxBlock =
  | { type: "p" | "h"; text: string }
  | { type: "img"; file: string; caption: string | null }
  | { type: "caption"; text: string };

export type DocxArticle = {
  issue: string;
  file: string;
  order: number;
  title: string;
  kicker?: string;
  source: string;
  blocks: DocxBlock[];
};

/** 比對用：去掉空白與標點，只留文字與數字。 */
export function lineKey(text: string, length = 12) {
  return text.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, length);
}

function sameLine(a: string, b: string) {
  const x = lineKey(a);
  const y = lineKey(b);
  if (x.length >= 3 && x === y && lineKey(a, 40) === lineKey(b, 40))
    return true;
  return (
    x.length >= 6 &&
    y.length >= 6 &&
    (x === y ||
      (x.length < 12 && y.startsWith(x)) ||
      (y.length < 12 && x.startsWith(y)))
  );
}

export type PlacedImage = {
  /** 來源網頁的圖片編號（{{image:n}}）。 */
  index: number;
  /** 放在 docx 第幾個文字段落之後；-1 表示在正文之前（首圖）。 */
  after: number;
  caption: string | null;
};

const MARKER = /\{\{image:(\d+)\}\}/g;
const HAS_MARKER = /\{\{image:\d+\}\}/;

/**
 * 在來源網頁的可讀文字裡找到 docx 正文的範圍，收集範圍內的圖片：
 * 圖片緊接的下一行若不是正文段落，就當作圖說。
 * 找不到正文開頭時回傳 null（改用 docx 自帶的圖片）。
 */
/** 網站標誌、橫幅、App 下載、廣告、圖示之類的圖片網址。 */
export const DECORATIVE_IMAGE =
  /(logo|banner|icon|app[-_]?download|adimages|\/ads?\/|qrcode|qr[-_]?code|printer|button|share|avatar|yellowblock|xiangguan|sprite|placeholder)/i;

export function placeSourceImages(
  article: Pick<DocxArticle, "title" | "blocks">,
  sourceText: string,
  maxImages = 10,
  imageUrls: string[] = []
): PlacedImage[] | null {
  const texts = article.blocks
    .map((block, index) => ({ block, index }))
    .filter(
      (
        item
      ): item is { block: { type: "p" | "h"; text: string }; index: number } =>
        item.block.type === "p" || item.block.type === "h"
    );
  if (!texts.length) return null;
  const lines = sourceText
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  // 正文開頭：前三段之一第一次出現的位置。
  let start = -1;
  let startText = 0;
  for (let k = 0; k < Math.min(3, texts.length) && start === -1; k += 1) {
    const found = lines.findIndex(line => sameLine(line, texts[k].block.text));
    if (found !== -1) {
      start = found;
      startText = k;
    }
  }
  if (start === -1) return null;

  // 首圖區：網頁上的標題到正文開頭之間。
  let regionStart = start;
  let titleFound = false;
  const titleKey = lineKey(article.title, 8);
  for (let i = start - 1; i >= Math.max(0, start - 40); i -= 1) {
    if (titleKey.length >= 4 && lineKey(lines[i], 40).includes(titleKey)) {
      regionStart = i + 1;
      titleFound = true;
      break;
    }
  }

  // 正文結尾：最後一段 docx 文字在網頁上的位置。
  let end = start;
  let pointer = startText;
  const isText = new Set<number>();
  const anchorAt = new Map<number, number>();
  for (let i = start; i < lines.length && pointer < texts.length; i += 1) {
    for (let k = pointer; k < Math.min(texts.length, pointer + 6); k += 1) {
      if (sameLine(lines[i], texts[k].block.text)) {
        isText.add(i);
        anchorAt.set(i, k);
        pointer = k + 1;
        end = i;
        break;
      }
    }
  }

  const placed: PlacedImage[] = [];
  const seen = new Set<number>();
  let after = -1;
  for (let i = regionStart; i <= end + 2 && i < lines.length; i += 1) {
    if (anchorAt.has(i)) after = anchorAt.get(i)!;
    const markers = Array.from(lines[i].matchAll(MARKER), match =>
      Number(match[1])
    );
    if (!markers.length) continue;
    let caption: string | null = null;
    const next = lines[i + 1];
    if (
      next &&
      !HAS_MARKER.test(next) &&
      !isText.has(i + 1) &&
      !texts.some(item => sameLine(next, item.block.text)) &&
      next.length >= 4 &&
      next.length <= 300
    ) {
      caption = next;
      i += 1;
    }
    for (const index of markers) {
      if (seen.has(index) || placed.length >= maxImages) continue;
      seen.add(index);
      if (imageUrls[index] && DECORATIVE_IMAGE.test(imageUrls[index])) continue;
      // 標題與正文之間的圖片是首圖；沒找到網頁標題時要有圖說才算。
      // 最後一段之後的圖片要有圖說（排除文末的相關文章縮圖）。
      if (i < start && !caption && !titleFound) continue;
      if (i > end && !caption) continue;
      placed.push({
        index,
        after: i < start ? -1 : after,
        caption: markers.length === 1 ? caption : null,
      });
    }
  }
  // after 目前是 texts 的索引，換成 blocks 的索引。
  return placed.map(image => ({
    ...image,
    after: image.after === -1 ? -1 : texts[image.after].index,
  }));
}

export type ResolvedImage = {
  url: string;
  alt: string;
  caption: string | null;
};

/**
 * 組成本站的正文區塊：docx 的段落與小標題依原順序，
 * 圖片插在對應段落之後；第一張圖抽出來當首圖。
 */
export function assembleBlocks(
  blocks: DocxBlock[],
  images: Array<ResolvedImage & { after: number }>
) {
  const ordered = [...images].sort((a, b) => a.after - b.after);
  const lead = ordered.filter(image => image.after === -1);
  const out: SiteBlock[] = [];
  const toBlock = (image: ResolvedImage): SiteBlock => ({
    type: "img",
    url: image.url,
    alt: image.alt,
    ...(image.caption ? { caption: image.caption } : {}),
  });
  for (const image of lead) out.push(toBlock(image));
  blocks.forEach((block, index) => {
    if (block.type === "p" || block.type === "h")
      out.push({ type: block.type, text: block.text });
    for (const image of ordered)
      if (image.after === index) out.push(toBlock(image));
  });
  const first = out.findIndex(block => block.type === "img");
  let featured: { url: string; caption: string | null } | null = null;
  if (first !== -1) {
    const [hero] = out.splice(first, 1);
    if (hero.type === "img")
      featured = { url: hero.url, caption: hero.caption ?? null };
  }
  return { blocks: out, featured };
}

/** 首頁卡片摘要：第一段夠長的正文，去掉「【某某讯】（记者报导）」等抬頭。 */
export function excerptFrom(blocks: DocxBlock[], max = 120) {
  for (const block of blocks) {
    if (block.type !== "p") continue;
    const text = block.text
      .replace(/^【[^】]{0,40}】\s*/, "")
      .replace(
        /^[（(][^）)]{0,40}(报导|報導|报道|采访|綜合|综合)[^）)]*[）)]\s*/,
        ""
      )
      .replace(/^文\s*[／/:：]\s*\S{1,12}\s*/, "")
      .trim();
    if (text.length < 30) continue;
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const stop = Math.max(
      cut.lastIndexOf("。"),
      cut.lastIndexOf("！"),
      cut.lastIndexOf("？")
    );
    return stop >= 40 ? cut.slice(0, stop + 1) : `${cut}……`;
  }
  return "";
}
