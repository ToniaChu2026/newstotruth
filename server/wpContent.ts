export type ContentImage = {
  index: number;
  mediaId: number;
  url: string;
  altText: string;
  caption?: string;
};

const MARKER = /\{\{image:(\d+)\}\}/g;

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

/** 將 AI 回傳的純文字切成段落；單換行與雙換行都視為段落分隔。 */
export function splitParagraphs(content: string) {
  return content
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}

export function paragraphBlock(text: string) {
  return `<!-- wp:paragraph {"style":{"typography":{"fontSize":"16px"}}} -->\n<p class="wp-block-paragraph" style="font-size:16px">${escapeHtml(text)}</p>\n<!-- /wp:paragraph -->`;
}

export function imageBlock(image: ContentImage) {
  const caption = image.caption?.trim()
    ? `<figcaption class="wp-element-caption">${escapeHtml(image.caption.trim())}</figcaption>`
    : "";
  return `<!-- wp:image {"id":${image.mediaId},"sizeSlug":"large","linkDestination":"none"} -->\n<figure class="wp-block-image size-large"><img src="${escapeAttribute(image.url)}" alt="${escapeAttribute(image.altText)}" class="wp-image-${image.mediaId}"/>${caption}</figure>\n<!-- /wp:image -->`;
}

export function sourceLinkBlock(sourceUrl: string) {
  const href = escapeAttribute(sourceUrl);
  return `<!-- wp:paragraph {"style":{"typography":{"fontSize":"14px"}}} -->\n<p class="wp-block-paragraph" style="font-size:14px">原文链接：<a href="${href}" rel="nofollow noopener" target="_blank">${escapeHtml(sourceUrl)}</a></p>\n<!-- /wp:paragraph -->`;
}

/** 列出內容中圖片標記的出現順序（去重）。 */
export function markerOrder(content: string) {
  const order: number[] = [];
  content.replace(MARKER, (_, rawIndex: string) => {
    const index = Number(rawIndex);
    if (!order.includes(index)) order.push(index);
    return "";
  });
  return order;
}

export type BuildOptions = {
  sourceUrl: string;
  /** 已設為特色圖片的索引不會再放進內文，避免首圖重複。 */
  featuredIndex?: number | null;
  appendSourceLink?: boolean;
};

/** 把 AI 整理後的純文字與已上傳的圖片組成 Gutenberg 區塊 HTML。 */
export function buildGutenbergContent(
  content: string,
  images: Map<number, ContentImage>,
  options: BuildOptions
) {
  const blocks: string[] = [];
  for (const paragraph of splitParagraphs(content)) {
    const segments = paragraph.split(/(\{\{image:\d+\}\})/);
    for (const segment of segments) {
      const marker = /^\{\{image:(\d+)\}\}$/.exec(segment);
      if (marker) {
        const index = Number(marker[1]);
        if (index === options.featuredIndex) continue;
        const image = images.get(index);
        if (image) blocks.push(imageBlock(image));
        continue;
      }
      const text = segment.trim();
      if (text) blocks.push(paragraphBlock(text));
    }
  }
  if (options.appendSourceLink !== false)
    blocks.push(sourceLinkBlock(options.sourceUrl));
  return blocks.join("\n\n");
}
