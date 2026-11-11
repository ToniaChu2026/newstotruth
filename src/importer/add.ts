import fs from "node:fs";
import path from "node:path";
import { blocksFromMarkedText } from "../blocks";
import { contentDir } from "../config";
import {
  loadPosts,
  mediaDir,
  nextSlug,
  postsDir,
  serializePost,
} from "../content";
import type { StructureFn } from "./ai";
import {
  downloadImage,
  extractImages,
  fetchPublicPage,
  htmlToReadableTextWithImageMarkers,
  markerOrder,
  metaTitle,
  normalizeAiArticle,
  retainPersistedImageMarkers,
  structureArticle,
  type ExtractedImage,
} from "./fetch";

/** 抓取階段的結果，存成 JSON 給整理階段（Claude 或 API）使用。 */
export type FetchedSource = {
  sourceUrl: string;
  finalUrl: string;
  pageTitle: string;
  /** 網頁的可讀文字，圖片位置以 {{image:n}} 標記。 */
  text: string;
  images: ExtractedImage[];
};

export type AddResult = {
  slug: string;
  file: string;
  title: string;
  category: string;
  tags: string[];
  imageCount: number;
  skippedImages: number;
  duplicate: boolean;
};

export type AddDeps = {
  dir?: string;
  download?: typeof downloadImage;
  now?: Date;
  draft?: boolean;
};

/**
 * 整理好的欄位。正文有兩種給法：
 * - content：直接給全文（需要翻譯或改寫時用）。
 * - contentRange：來源已經是可用的簡體中文時，只指出正文在來源文字裡的起訖，
 *   由程式原樣擷取，不必重打一遍。omit 可列出要刪掉的段落開頭（例如圖說、延伸閱讀）。
 */
export type StructuredInput = {
  title?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  content?: string;
  contentRange?: { start: string; end?: string; omit?: string[] };
};

export function resolveContent(input: StructuredInput, sourceText: string) {
  if (input.content?.trim() || !input.contentRange) return input;
  const { start, end, omit = [] } = input.contentRange;
  const from = sourceText.indexOf(start);
  if (!start || from === -1)
    throw new Error("contentRange.start 在來源文字裡找不到。");
  const to = end ? sourceText.indexOf(end, from + start.length) : -1;
  if (end && to === -1)
    throw new Error("contentRange.end 在來源文字裡找不到。");
  const content = sourceText
    .slice(from, end ? to : undefined)
    .split(/\n+/)
    .map(line => line.trim())
    .filter(
      line => line && !omit.some(prefix => prefix && line.startsWith(prefix))
    )
    .join("\n\n");
  return { ...input, content };
}

export function findBySource(sourceUrl: string, dir = contentDir()) {
  return loadPosts(dir).find(post => post.source === sourceUrl) ?? null;
}

export async function fetchSource(
  url: string,
  fetchPage: typeof fetchPublicPage = fetchPublicPage
): Promise<FetchedSource> {
  const sourceUrl = url.trim();
  const { html, finalUrl } = await fetchPage(sourceUrl);
  const images = extractImages(html, finalUrl);
  return {
    sourceUrl,
    finalUrl,
    pageTitle: metaTitle(html),
    text: htmlToReadableTextWithImageMarkers(html, finalUrl, images).slice(
      0,
      120_000
    ),
    images,
  };
}

/**
 * 把整理好的欄位寫成文章檔：下載圖片到 content/media，第一張當首圖，
 * 其餘留在正文原位。單張圖片失敗只略過該張。
 */
export async function addArticle(
  source: FetchedSource,
  structured: unknown,
  deps: AddDeps = {}
): Promise<AddResult> {
  const dir = deps.dir ?? contentDir();
  const download = deps.download ?? downloadImage;
  const now = deps.now ?? new Date();

  const existing = findBySource(source.sourceUrl, dir);
  if (existing)
    return {
      slug: existing.slug,
      file: path.join(postsDir(dir), `${existing.slug}.md`),
      title: existing.title,
      category: existing.category,
      tags: existing.tags,
      imageCount: 0,
      skippedImages: 0,
      duplicate: true,
    };

  const sourceMarkers = Array.from(
    new Set(source.text.match(/\{\{image:\d+\}\}/g) || [])
  );
  const article = normalizeAiArticle(
    structured && typeof structured === "object"
      ? resolveContent(structured as StructuredInput, source.text)
      : structured,
    source.pageTitle,
    sourceMarkers
  );

  const slug = nextSlug(now, dir);
  fs.mkdirSync(mediaDir(dir), { recursive: true });
  fs.mkdirSync(postsDir(dir), { recursive: true });
  const saved = new Map<number, { url: string; altText: string }>();
  let skipped = 0;
  for (const index of markerOrder(article.content)) {
    const candidate = source.images[index];
    if (!candidate) continue;
    try {
      const file = await download(candidate);
      const name = `${slug}-${saved.size + 1}.${file.extension}`;
      fs.writeFileSync(path.join(mediaDir(dir), name), file.bytes);
      saved.set(index, {
        url: `/media/${name}`,
        altText: candidate.altText || article.title,
      });
    } catch (error) {
      skipped += 1;
      console.warn(
        "圖片略過：",
        candidate.url,
        error instanceof Error ? error.message : error
      );
    }
  }

  const content = retainPersistedImageMarkers(
    article.content,
    Array.from(saved.keys())
  );
  const featuredIndex = markerOrder(content)[0] ?? null;
  const file = path.join(postsDir(dir), `${slug}.md`);
  fs.writeFileSync(
    file,
    serializePost({
      title: article.title,
      date: now.toISOString(),
      category: article.category,
      tags: article.tags,
      excerpt: article.summary,
      image: featuredIndex === null ? null : saved.get(featuredIndex)!.url,
      source: source.sourceUrl,
      draft: Boolean(deps.draft),
      blocks: blocksFromMarkedText(content, saved, featuredIndex),
    })
  );
  return {
    slug,
    file,
    title: article.title,
    category: article.category,
    tags: article.tags,
    imageCount: saved.size,
    skippedImages: skipped,
    duplicate: false,
  };
}

/** 全自動：抓取後直接呼叫 Claude API 整理（需要 ANTHROPIC_API_KEY）。 */
export async function importWithApi(
  url: string,
  deps: AddDeps & {
    structure?: StructureFn;
    fetchPage?: typeof fetchPublicPage;
  } = {}
) {
  const source = await fetchSource(url, deps.fetchPage);
  const article = await structureArticle(
    source.finalUrl,
    source.text,
    source.pageTitle,
    deps.structure
  );
  return addArticle(source, article, deps);
}
