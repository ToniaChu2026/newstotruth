/**
 * 把原本 WordPress 網站（newstotruth.com）的文章搬進 content/。
 * 不經 AI，原樣保留標題、摘要、正文、分類、日期、網址與圖說。
 *
 *   pnpm migrate-wp            最新 12 篇
 *   pnpm migrate-wp 50         最新 50 篇
 *   pnpm migrate-wp 12 13      跳過最新 12 篇，再搬 13 篇（第 13 到 25 篇）
 *   pnpm migrate-wp 500 --category 特稿   只搬原網站「特稿」分類的文章，分類一律設成特稿
 *   pnpm migrate-wp <網址> <網址>… [--category 历史]   只搬這幾篇；加 --category 則放進該分類
 *
 * 已經存在的文章（同網址或同來源）會略過，可以放心重跑。
 */
import fs from "node:fs";
import path from "node:path";
import type { SiteBlock } from "../src/blocks";
import {
  contentDir,
  DEFAULT_CATEGORY_NAME,
  isCategoryName,
} from "../src/config";
import {
  isValidSlug,
  mediaDir,
  postsDir,
  serializePost,
  titleSlug,
  uniqueSlug,
} from "../src/content";
import { findBySource, mediaPrefix } from "../src/importer/add";
import { downloadImage } from "../src/importer/fetch";
import { saveCompactImage } from "../src/importer/images";
import {
  htmlText as text,
  parseWpContent,
  type RawImage,
} from "../src/importer/wordpress";

const SITE = (process.env.WP_SITE ?? "https://newstotruth.com").replace(
  /\/+$/,
  ""
);

type WpTerm = { id: number; name: string; taxonomy: string };
type WpMedia = {
  source_url: string;
  alt_text?: string;
  caption?: { rendered: string };
  media_details?: { sizes?: Record<string, { source_url: string }> };
};
type WpPost = {
  id: number;
  slug: string;
  link: string;
  date_gmt: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  categories: number[];
  _embedded?: { "wp:featuredmedia"?: WpMedia[]; "wp:term"?: WpTerm[][] };
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok)
    throw new Error(`讀取失敗（HTTP ${response.status}）：${url}`);
  return (await response.json()) as T;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--category");
  const onlyCategory = flag !== -1 ? args[flag + 1] : null;
  if (onlyCategory !== null && !isCategoryName(onlyCategory))
    throw new Error(`沒有這個分類：${onlyCategory}`);
  const rest = args.filter(
    (arg, index) => flag === -1 || (index !== flag && index !== flag + 1)
  );
  // 給了文章網址時只搬那幾篇（網址的路徑就是 WordPress 的 slug）。
  const urls = rest.filter(arg => /^https?:\/\//.test(arg));
  const numbers = rest.filter(arg => !/^https?:\/\//.test(arg));
  const count = Math.max(1, Math.min(Number(numbers[0]) || 12, 500));
  const offset = Math.max(0, Number(numbers[1]) || 0);
  const dir = contentDir();
  fs.mkdirSync(postsDir(dir), { recursive: true });
  fs.mkdirSync(mediaDir(dir), { recursive: true });

  const categories = new Map(
    (
      await getJson<Array<{ id: number; name: string }>>(
        `${SITE}/wp-json/wp/v2/categories?per_page=100&_fields=id,name`
      )
    ).map(category => [category.id, text(category.name)])
  );

  const categoryId =
    onlyCategory && !urls.length
      ? [...categories].find(([, name]) => name === onlyCategory)?.[0]
      : undefined;
  if (onlyCategory && !urls.length && categoryId === undefined)
    throw new Error(`原網站沒有「${onlyCategory}」分類`);
  const filter = categoryId !== undefined ? `&categories=${categoryId}` : "";

  const posts: WpPost[] = [];
  for (const url of urls) {
    const slug = decodeURIComponent(new URL(url).pathname).replace(
      /^\/+|\/+$/g,
      ""
    );
    const [post] = await getJson<WpPost[]>(
      `${SITE}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=wp:featuredmedia,wp:term`
    );
    if (post) posts.push(post);
    else console.warn(`找不到文章：${url}`);
  }
  for (let page = 1; !urls.length && posts.length < offset + count; page += 1) {
    const batch = await getJson<WpPost[]>(
      `${SITE}/wp-json/wp/v2/posts?per_page=50&page=${page}&orderby=date&order=desc&_embed=wp:featuredmedia,wp:term${filter}`
    ).catch(() => []);
    if (!batch.length) break;
    posts.push(...batch);
  }

  let added = 0;
  for (const post of urls.length ? posts : posts.slice(offset, offset + count)) {
    const title = text(post.title.rendered);
    const decoded = (() => {
      try {
        return decodeURIComponent(post.slug);
      } catch {
        return post.slug;
      }
    })();
    const slug = isValidSlug(decoded) ? decoded : titleSlug(title);
    const { blocks: raw, source: original } = parseWpContent(
      post.content.rendered
    );
    const source = original ?? post.link;
    if (
      fs.existsSync(path.join(postsDir(dir), `${slug}.md`)) ||
      findBySource(source, dir)
    ) {
      console.log(
        `略過（已存在）：${title}${findBySource(source, dir) ? `（同來源：/${findBySource(source, dir)!.slug}/，分類 ${findBySource(source, dir)!.category}）` : ""}`
      );
      continue;
    }

    const date = new Date(`${post.date_gmt}Z`);
    const prefix = mediaPrefix(source, date, dir);
    let n = 0;
    let skipped = 0;
    const save = async (image: RawImage) => {
      try {
        const file = await downloadImage({
          url: image.url,
          altText: image.alt,
          index: n,
        });
        n += 1;
        const name = saveCompactImage(
          path.join(mediaDir(dir), `${prefix}-${n}.${file.extension}`),
          file.bytes
        );
        return `/media/${name}`;
      } catch (error) {
        skipped += 1;
        console.warn(
          `  圖片略過：${image.url}（${error instanceof Error ? error.message : error}）`
        );
        return null;
      }
    };

    const featured = post._embedded?.["wp:featuredmedia"]?.[0];
    let image: string | null = null;
    let caption: string | null = null;
    if (featured?.source_url) {
      const sizes = featured.media_details?.sizes ?? {};
      image = await save({
        url: sizes.large?.source_url ?? featured.source_url,
        alt: text(featured.alt_text ?? ""),
      });
      caption = image ? text(featured.caption?.rendered ?? "") || null : null;
    }

    const blocks: SiteBlock[] = [];
    for (const block of raw) {
      if (block.type !== "img") {
        blocks.push(block);
        continue;
      }
      const url = await save(block);
      if (url)
        blocks.push({
          type: "img",
          url,
          alt: block.alt || block.caption || title,
          ...(block.caption ? { caption: block.caption } : {}),
        });
    }
    if (!image) {
      const first = blocks.findIndex(block => block.type === "img");
      if (first !== -1) {
        const [hero] = blocks.splice(first, 1);
        if (hero.type === "img") {
          image = hero.url;
          caption = hero.caption ?? null;
        }
      }
    }

    const categoryName =
      onlyCategory ??
      post.categories
        .map(id => categories.get(id) ?? "")
        .find(isCategoryName) ?? DEFAULT_CATEGORY_NAME;
    const tags = (post._embedded?.["wp:term"] ?? [])
      .flat()
      .filter(term => term.taxonomy === "post_tag")
      .map(term => text(term.name));
    const finalSlug = uniqueSlug(slug, dir);
    fs.writeFileSync(
      path.join(postsDir(dir), `${finalSlug}.md`),
      serializePost({
        title,
        date: date.toISOString(),
        category: categoryName,
        tags,
        excerpt: text(post.excerpt.rendered).replace(
          /\s*\[(…|&hellip;|\.\.\.)\]\s*$/,
          ""
        ),
        image,
        caption,
        source,
        draft: false,
        blocks,
      })
    );
    added += 1;
    console.log(
      `已加入：${title}（${categoryName}，圖片 ${n} 張${skipped ? `，略過 ${skipped} 張` : ""}）→ /${finalSlug}/`
    );
  }
  console.log(`完成：新增 ${added} 篇。`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
