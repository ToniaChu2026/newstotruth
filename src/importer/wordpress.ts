import { decodeHtml } from "./fetch";

/** 搬移舊 WordPress 文章用的解析工具（scripts/migrate-wp.ts）。 */

export function htmlText(html: string) {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export type RawImage = { url: string; alt: string; caption?: string };
export type RawBlock =
  | { type: "p" | "h"; text: string }
  | ({ type: "img" } & RawImage);

/** 把 WordPress 區塊 HTML 拆成段落、小標題與圖片；圖片後面那行置中斜體字就是圖說。 */
export function parseWpContent(html: string) {
  const blocks: RawBlock[] = [];
  let source: string | null = null;
  const pattern =
    /<figure\b[^>]*>([\s\S]*?)<\/figure>|<(p|h[1-6])\b([^>]*)>([\s\S]*?)<\/\2>/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1] !== undefined) {
      const img = /<img\b[^>]*>/i.exec(match[1])?.[0];
      const src = img && /\bsrc="([^"]+)"/i.exec(img)?.[1];
      if (!src) continue;
      const caption = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(
        match[1]
      );
      blocks.push({
        type: "img",
        url: decodeHtml(src),
        alt: htmlText(/\balt="([^"]*)"/i.exec(img)?.[1] ?? ""),
        ...(caption && htmlText(caption[1])
          ? { caption: htmlText(caption[1]) }
          : {}),
      });
      continue;
    }
    const tag = match[2].toLowerCase();
    const inner = match[4];
    const value = htmlText(inner);
    if (!value) continue;
    const link = /^原文[链連]接[：:]\s*(\S+)/.exec(value);
    if (link) {
      source = /href="([^"]+)"/i.exec(inner)?.[1] ?? link[1];
      continue;
    }
    const previous = blocks[blocks.length - 1];
    // 圖說：緊接在圖片後、整段斜體或置中的短段落。
    const italic = /^\s*<em>[\s\S]*<\/em>\s*$/i.test(inner);
    const centered = /has-text-align-center/.test(match[3]);
    if (
      (italic || centered) &&
      value.length <= 300 &&
      previous?.type === "img" &&
      !previous.caption
    ) {
      previous.caption = value;
      continue;
    }
    const bold = /^\s*<(strong|b)>[\s\S]*<\/\1>\s*$/i.test(inner);
    blocks.push({ type: tag === "p" && !bold ? "p" : "h", text: value });
  }
  return { blocks, source };
}
