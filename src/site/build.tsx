import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build as viteBuild } from "vite";
import { CATEGORIES, contentDir, loadSiteConfig } from "../config";
import { loadPosts, mediaDir, type Post } from "../content";
import {
  ArticlePage,
  formatDate,
  ListPage,
  NotFoundPage,
  Page,
  postPath,
  SearchPage,
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
  /** 網站完整網址（含子路徑），例如 https://user.github.io/newstotruth。 */
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
  const origin = (options.siteUrl ?? process.env.SITE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const config = loadSiteConfig(content);
  const posts = loadPosts(content).filter(post => !post.draft);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });

  const css = await buildCss();
  const cssFile = hashed("site.css", css);
  fs.writeFileSync(path.join(outDir, cssFile), css);
  const searchJs = fs.readFileSync(path.join(here, "search.js"));
  const searchFile = hashed("search.js", searchJs);
  fs.writeFileSync(path.join(outDir, searchFile), searchJs);

  const site: Site = {
    config,
    base,
    origin,
    recent: posts.slice(0, 5),
    cssFile,
    searchFile,
  };
  const written: string[] = [];
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
    if (!meta.noindex) written.push(meta.path);
  };
  const pagePath = (prefix: string, page: number) =>
    page === 1 ? prefix : `${prefix}page/${page}/`;

  // 首頁：第一頁的第一篇當頭條。
  const hasBanner = Boolean(config.hero?.image);
  const homePages = chunk(posts, config.pageSize);
  homePages.forEach((items, index) => {
    const page = index + 1;
    const route = pagePath("/", page);
    write(
      `${route}index.html`,
      {
        title: page === 1 ? config.name : `第 ${page} 页 | ${config.name}`,
        description: config.description || config.tagline,
        path: route,
        nav: "/",
      },
      <ListPage
        site={site}
        total={posts.length}
        banner={page === 1 && hasBanner}
        hero={page === 1 && !hasBanner ? (items[0] ?? null) : null}
        posts={page === 1 && !hasBanner ? items.slice(1) : items}
        page={page}
        pages={homePages.length}
        pathFor={target => pagePath("/", target)}
      />
    );
  });

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
          title: `${category.name} | ${config.name}`,
          description: `${config.name}「${category.name}」栏目文章`,
          path: route,
          nav: category.slug,
        },
        <ListPage
          site={site}
          heading={category.name}
          total={inCategory.length}
          posts={items}
          page={page}
          pages={pages.length}
          pathFor={target => pagePath(prefix, target)}
        />
      );
    });
  }

  for (const post of posts) {
    const related = posts
      .filter(
        item => item.category === post.category && item.slug !== post.slug
      )
      .slice(0, 3);
    write(
      `/${post.slug}/index.html`,
      {
        title: `${post.title} | ${config.name}`,
        description: post.excerpt,
        path: postPath(post),
        image: post.image,
        nav: CATEGORIES.find(category => category.name === post.category)?.slug,
      },
      <ArticlePage site={site} post={post} related={related} />
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
        dateText: formatDate(site, post.date),
        text: post.blocks
          .map(block => (block.type === "img" ? "" : block.text))
          .join(" ")
          .slice(0, 6000),
      }))
    )
  );

  const media = mediaDir(content);
  if (fs.existsSync(media))
    fs.cpSync(media, path.join(outDir, "media"), { recursive: true });

  if (origin) {
    fs.writeFileSync(
      path.join(outDir, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${written
        .map(route => `  <url><loc>${xml(origin + route)}</loc></url>`)
        .join("\n")}\n</urlset>\n`
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
