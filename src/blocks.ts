export type SiteBlock =
  | { type: "p"; text: string }
  /** 小標題，文章檔裡寫成「## 文字」。 */
  | { type: "h"; text: string }
  | { type: "img"; url: string; alt: string; caption?: string };

const IMAGE_LINE = /^!\[(.*?)\]\((\S+?)(?:\s+"(.*)")?\)$/;
const MARKER_SPLIT = /(\{\{image:\d+\}\})/;

/** 只允許本站媒體（/media/…）或 https 圖片。 */
export function isSafeImageUrl(url: string) {
  return /^\/media\/[\w.\-]+$/.test(url) || /^https:\/\/[^\s"'<>]+$/.test(url);
}

export type MarkerImage = { url: string; altText: string; caption?: string };

/** 把 AI 回傳的純文字（含 {{image:n}} 標記）轉成本站的內容區塊。 */
export function blocksFromMarkedText(
  text: string,
  images: Map<number, MarkerImage>,
  featuredIndex: number | null
): SiteBlock[] {
  const blocks: SiteBlock[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split(/\n+/)) {
    for (const segment of line.split(MARKER_SPLIT)) {
      const marker = /^\{\{image:(\d+)\}\}$/.exec(segment);
      if (marker) {
        const index = Number(marker[1]);
        if (index === featuredIndex) continue;
        const image = images.get(index);
        if (image)
          blocks.push({
            type: "img",
            url: image.url,
            alt: image.altText,
            ...(image.caption?.trim() ? { caption: image.caption.trim() } : {}),
          });
        continue;
      }
      const paragraph = segment.trim();
      if (paragraph) blocks.push({ type: "p", text: paragraph });
    }
  }
  return blocks;
}

/** 文章檔的正文格式：段落以空行分隔，小標題寫成 ## 文字，圖片寫成 ![說明](網址 "圖說")。 */
export function blocksToEditable(blocks: SiteBlock[]) {
  return blocks
    .map(block =>
      block.type === "p"
        ? block.text
        : block.type === "h"
          ? `## ${block.text}`
          : `![${block.alt.replace(/[\[\]\n]/g, " ")}](${block.url}${block.caption ? ` "${block.caption.replace(/["\n]/g, " ")}"` : ""})`
    )
    .join("\n\n");
}

export function editableToBlocks(text: string): SiteBlock[] {
  const blocks: SiteBlock[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const image = IMAGE_LINE.exec(line);
    if (image && isSafeImageUrl(image[2])) {
      blocks.push({
        type: "img",
        url: image[2],
        alt: image[1].trim(),
        ...(image[3]?.trim() ? { caption: image[3].trim() } : {}),
      });
      continue;
    }
    const heading = /^#{2,4}\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "h", text: heading[1].trim() });
      continue;
    }
    blocks.push({ type: "p", text: line });
  }
  return blocks;
}
