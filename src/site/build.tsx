import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build as viteBuild } from "vite";
import { CATEGORIES, contentDir, loadSiteConfig } from "../config";
import { imageSize } from "./image-size";
import { loadPages, loadPosts, mediaDir, type Post } from "../content";
import {
  ArticlePage,
  formatDate,
  CategoryPage,
  ListPage,
  NotFoundPage,
  Page,
  plainText,
  postPath,
  SearchPage,
  StaticPage,
  type PageMeta,
  type Site,
} from "./components";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

export type BuildOptions = {
  contentDir?: string;
  outDir?: string;
  /** 網站掛在子路徑時的前綴，例如 /newstotruth。 */
  basePath?: string;
  /** 網站完整網址（含子路徑），例如 https://news-focus.org；預設取 site.json 的 url。 */
  siteUrl?: string;
};

function hashed(name: string, content: string | Buffer) {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 10);
  const ext = path.extname(name);
  return `/assets/${path.basename(name, ext)}.${hash}${ext}`;
}

async function buildCss() {
  const result = await viteBuild({
    configFile: false,
    root,
    logLevel: "warn",
    plugins: [tailwindcss()],
    build: {
      write: false,
      rollupOptions: { input: path.join(here, "styles.css") },
    },
  });
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!("output" in output)) continue;
    for (const chunk of output.output)
      if (chunk.type === "asset" && chunk.fileName.endsWith(".css"))
        return String(chunk.source);
  }
  throw new Error("樣式表產生失敗。");
}

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    pages.push(items.slice(i, i + size));
  return pages.length ? pages : [[]];
}

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 把 content/ 裡的文章產生成一個可以直接放上 GitHub Pages 的靜態網站。 */
export async function buildSite(options: BuildOptions = {}) {
  const content = options.contentDir ?? contentDir();
  const outDir = path.resolve(options.outDir ?? path.join(root, "dist"));
  const base = (options.basePath ?? process.env.BASE_PATH ?? "")
    .trim()
    .replace(/\/+$/, "");
  const config = loadSiteConfig(content);
  // 正式網址以 site.json 的 url 為準（GitHub Pages 的副本也指向正式網域），
  // 沒設定時才用建置環境給的 SITE_URL。
  const origin = (options.siteUrl ?? config.url ?? process.env.SITE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const everything = [...loadPosts(content), ...loadPages(content)];
  const posts = loadPosts(content).filter(post => !post.draft);
  const staticPages = loadPages(content).filter(page => !page.draft);
  // 首頁與近期文章只放有首圖的文章；沒有配圖的仍在分類頁、搜尋與文章頁。
  const homePosts = posts.filter(post => post.image);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });

  const css = await buildCss();
  const cssFile = hashed("site.css", css);
  fs.writeFileSync(path.join(outDir, cssFile), css);
  const searchJs = fs.readFileSync(path.join(here, "search.js"));
  const searchFile = hashed("search.js", searchJs);
  fs.writeFileSync(path.join(outDir, searchFile), searchJs);

  // 本站圖片的像素寬高，寫進 <img> 的 width / height。
  const sizes: Site["sizes"] = new Map();
  if (fs.existsSync(mediaDir(content)))
    for (const name of fs.readdirSync(mediaDir(content))) {
      const size = imageSize(path.join(mediaDir(content), name));
      if (size) sizes.set(`/media/${name}`, size);
    }

  const site: Site = {
    config,
    base,
    origin,
    recent: homePosts.slice(0, 5),
    cssFile,
    searchFile,
    sizes,
  };
  const written: Array<{ path: string; lastmod?: string }> = [];
  const write = (file: string, meta: PageMeta, body: ReactElement) => {
    const target = path.join(outDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      `<!doctype html>${renderToStaticMarkup(
        <Page site={site} meta={meta}>
          {body}
        </Page>
      )}`
    );
    if (!meta.noindex)
      written.push({ path: meta.path, lastmod: meta.lastmod });
  };
  const pagePath = (prefix: string, page: number) =>
    page === 1 ? prefix : `${prefix}page/${page}/`;

  // 首頁：第一頁的第一篇當頭條。
  const hasBanner = Boolean(config.hero?.image);
  const homePages = chunk(
    config.homePages
      ? homePosts.slice(0, config.homePages * config.pageSize)
      : homePosts,
    config.pageSize
  );
  homePages.forEach((items, index) => {
    const page = index + 1;
    const route = pagePath("/", page);
    write(
      `${route}index.html`,
      {
        title: page === 1 ? config.name : `第 ${page} 页 | ${config.name}`,
        description:
          (config.description || config.tagline) +
          (page === 1 ? "" : `（第 ${page} 页）`),
        path: route,
        nav: "/",
        lastmod: items[0]?.date,
      },
      <ListPage
        site={site}
        banner={page === 1 && hasBanner}
        hero={page === 1 && !hasBanner ? (items[0] ?? null) : null}
        posts={page === 1 && !hasBanner ? items.slice(1) : items}
        page={page}
        pages={homePages.length}
        pathFor={target => pagePath("/", target)}
      />
    );
  });

  const counts = CATEGORIES.map(category => ({
    name: category.name,
    count: posts.filter(post => post.category === category.name).length,
  }));
  for (const category of CATEGORIES) {
    const inCategory = posts.filter(post => post.category === category.name);
    const prefix = `/category/${category.slug}/`;
    const pages = chunk(inCategory, config.pageSize);
    pages.forEach((items, index) => {
      const page = index + 1;
      const route = pagePath(prefix, page);
      write(
        `${route}index.html`,
        {
          title:
            page === 1
              ? `${category.name} | ${config.name}`
              : `${category.name} - 第 ${page} 页 | ${config.name}`,
          description:
            `${config.name}「${category.name}」栏目文章` +
            (page === 1 ? "" : `（第 ${page} 页）`),
          path: route,
          nav: category.slug,
          lastmod: items[0]?.date,
        },
        <CategoryPage
          site={site}
          name={category.name}
          posts={items}
          page={page}
          pages={pages.length}
          pathFor={target => pagePath(prefix, target)}
          counts={counts}
        />
      );
    });
  }

  for (const post of posts) {
    const related = posts
      .filter(
        item => item.category === post.category && item.slug !== post.slug
      )
      .slice(0, 5);
    write(
      `/${post.slug}/index.html`,
      {
        title: `${post.title} | ${config.name}`,
        description: post.excerpt,
        path: postPath(post),
        image: post.image,
        nav: CATEGORIES.find(category => category.name === post.category)?.slug,
        article: {
          published: post.date,
          section: post.category,
          source: post.source,
        },
        lastmod: post.date,
      },
      <ArticlePage site={site} post={post} related={related} />
    );
  }

  for (const page of staticPages) {
    const firstParagraph = page.blocks.find(block => block.type === "p");
    write(
      `/${page.slug}/index.html`,
      {
        title: `${page.title} | ${config.name}`,
        description:
          page.excerpt ||
          (firstParagraph?.type === "p"
            ? plainText(firstParagraph.text).slice(0, 160)
            : ""),
        path: postPath(page),
        image: page.image,
      },
      <StaticPage site={site} page={page} />
    );
  }

  write(
    "/search/index.html",
    {
      title: `搜索 | ${config.name}`,
      description: "",
      path: "/search/",
      noindex: true,
    },
    <SearchPage site={site} />
  );
  write(
    "/404.html",
    {
      title: `找不到页面 | ${config.name}`,
      description: "",
      path: "/404.html",
      noindex: true,
    },
    <NotFoundPage site={site} />
  );

  // 搜尋索引分兩個檔：search-index.json 只有標題、摘要等（小，先載入、先出結果），
  // search-text.json 是同樣順序的正文（大，之後才載入，用來補上只在正文出現的結果）。
  fs.writeFileSync(
    path.join(outDir, "search-index.json"),
    JSON.stringify(
      posts.map((post: Post) => ({
        path: postPath(post),
        title: post.title,
        excerpt: post.excerpt,
        category: post.category,
        tags: post.tags,
        image: post.image,
        ...(post.image && sizes.has(post.image)
          ? { size: [sizes.get(post.image)!.width, sizes.get(post.image)!.height] }
          : {}),
        dateText: formatDate(site, post.date),
      }))
    )
  );
  fs.writeFileSync(
    path.join(outDir, "search-text.json"),
    JSON.stringify(
      posts.map((post: Post) =>
        post.blocks
          .map(block => (block.type === "img" ? "" : plainText(block.text)))
          .join(" ")
          .slice(0, 6000)
      )
    )
  );

  const media = mediaDir(content);
  if (fs.existsSync(media)) {
    // 只有草稿用到的圖片不發佈：草稿還沒上線，它的圖也不該能用網址打開。
    const filesOf = (items: Post[]) =>
      items
        .flatMap(item => [
          item.image,
          ...item.blocks.map(block => (block.type === "img" ? block.url : null)),
        ])
        .filter((url): url is string => Boolean(url?.startsWith("/media/")))
        .map(url => url.slice("/media/".length));
    const live = new Set([
      ...filesOf(everything.filter(item => !item.draft)),
      ...[config.logo, config.hero?.image]
        .filter((url): url is string => Boolean(url?.startsWith("/media/")))
        .map(url => url.slice("/media/".length)),
    ]);
    const draftOnly = new Set(
      filesOf(everything.filter(item => item.draft)).filter(
        file => !live.has(file)
      )
    );
    fs.cpSync(media, path.join(outDir, "media"), {
      recursive: true,
      filter: source => !draftOnly.has(path.basename(source)),
    });
  }

  if (origin) {
    fs.writeFileSync(
      path.join(outDir, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${written
        .map(
          ({ path: route, lastmod }) =>
            `  <url><loc>${xml(origin + route)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}</url>`
        )
        .join("\n")}\n</urlset>\n`
    );
    // RSS：最新 30 篇，只放摘要。
    fs.writeFileSync(
      path.join(outDir, "feed.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n` +
        `<title>${xml(config.name)}</title>\n<link>${xml(origin)}/</link>\n` +
        `<description>${xml(config.description || config.tagline || config.name)}</description>\n` +
        `<language>zh-Hans</language>\n` +
        `<atom:link href="${xml(origin)}/feed.xml" rel="self" type="application/rss+xml"/>\n` +
        (posts[0]
          ? `<lastBuildDate>${new Date(posts[0].date).toUTCString()}</lastBuildDate>\n`
          : "") +
        posts
          .slice(0, 30)
          .map(post => {
            const link = xml(origin + postPath(post));
            return (
              `<item>\n<title>${xml(post.title)}</title>\n<link>${link}</link>\n` +
              `<guid isPermaLink="true">${link}</guid>\n` +
              `<pubDate>${new Date(post.date).toUTCString()}</pubDate>\n` +
              `<category>${xml(post.category)}</category>\n` +
              `<description>${xml(post.excerpt)}</description>\n</item>\n`
            );
          })
          .join("") +
        `</channel>\n</rss>\n`
    );
    fs.writeFileSync(
      path.join(outDir, "robots.txt"),
      `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
    );
  }
  return { outDir, posts: posts.length, pages: written.length + 2 };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  buildSite()
    .then(result =>
      console.log(
        `網站已產生：${result.posts} 篇文章、${result.pages} 個頁面 → ${path.relative(process.cwd(), result.outDir) || "."}`
      )
    )
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
