import type { ReactNode } from "react";
import { CATEGORIES, categorySlug, type SiteConfig } from "../config";
import type { Post } from "../content";

/** 產生頁面時共用的環境：網站設定、網址前綴與近期文章。 */
export type Site = {
  config: SiteConfig;
  /** 網站掛在子路徑時的前綴，例如 /newstotruth；掛在網域根目錄時是空字串。 */
  base: string;
  /** 完整網址（含網域），用於分享圖與 sitemap；不知道時是空字串。 */
  origin: string;
  recent: Post[];
  cssFile: string;
  searchFile: string;
};

export type PageMeta = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  noindex?: boolean;
  /** 目前所在的導覽項目：首頁是 "/"，分類頁是分類的 slug。 */
  nav?: string;
};

export function href(site: Site, path: string) {
  return `${site.base}${path}`;
}
/** 圖片網址：本站媒體加上前綴，外部 https 圖片原樣使用。 */
export function media(site: Site, url: string) {
  return url.startsWith("/") ? href(site, url) : url;
}
export function postPath(post: Post) {
  return `/post/${post.slug}/`;
}
export function categoryPath(name: string) {
  return `/category/${categorySlug(name)}/`;
}
export function formatDate(site: Pick<Site, "config">, value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: site.config.timeZone,
  });
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  search: "m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  left: "m15 18-6-6 6-6",
  right: "m9 18 6-6-6-6",
};

function Nav({ site, current }: { site: Site; current?: string }) {
  const items = [
    { key: "/", label: "首页", path: "/" },
    ...CATEGORIES.map(category => ({
      key: category.slug,
      label: category.name,
      path: `/category/${category.slug}/`,
    })),
  ];
  return (
    <>
      {items.map(item => {
        const active = item.key === current;
        return (
          <a
            key={item.key}
            href={href(site, item.path)}
            aria-current={active ? "page" : undefined}
            className={`relative shrink-0 px-3 py-2 text-[15px] transition-colors hover:text-[var(--brand)] ${active ? "font-medium text-[var(--brand)]" : "text-stone-600"}`}
          >
            {item.label}
            {active ? (
              <span className="absolute inset-x-3 -bottom-px h-0.5 bg-[var(--brand)]" />
            ) : null}
          </a>
        );
      })}
    </>
  );
}

function Footer({ site }: { site: Site }) {
  const { config } = site;
  return (
    <footer className="mt-16 bg-stone-900 text-stone-300">
      <div className="grid gap-10 px-5 py-12 sm:px-10 md:grid-cols-[1.2fr_2fr_1fr]">
        <div>
          <p className="font-display text-2xl text-white">{config.name}</p>
          {config.description ? (
            <p className="mt-3 text-sm leading-7 text-stone-400">
              {config.description}
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-bold tracking-[.2em] text-[var(--brand-soft)]">
            近期文章
          </p>
          <ul className="mt-4 space-y-3">
            {site.recent.length ? (
              site.recent.map(post => (
                <li key={post.slug} className="text-sm leading-6">
                  <a
                    href={href(site, postPath(post))}
                    className="text-stone-200 hover:text-[var(--brand-soft)]"
                  >
                    {post.title}
                  </a>
                  <span className="ml-2 text-xs text-stone-500">
                    {formatDate(site, post.date)}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-stone-500">暂无文章</li>
            )}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold tracking-[.2em] text-[var(--brand-soft)]">
            栏目
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {CATEGORIES.map(category => (
              <li key={category.slug}>
                <a
                  href={href(site, `/category/${category.slug}/`)}
                  className="text-stone-300 hover:text-[var(--brand-soft)]"
                >
                  {category.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-5 text-xs text-stone-500 sm:px-10">
        © {new Date().getFullYear()} {config.name} · All Rights Reserved
      </div>
    </footer>
  );
}

export function Page({
  site,
  meta,
  children,
}: {
  site: Site;
  meta: PageMeta;
  children: ReactNode;
}) {
  const { config } = site;
  const canonical = site.origin ? `${site.origin}${meta.path}` : null;
  const image = meta.image
    ? meta.image.startsWith("/")
      ? site.origin
        ? `${site.origin}${meta.image}`
        : null
      : meta.image
    : null;
  return (
    <html lang="zh-Hans">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{meta.title}</title>
        {meta.description ? (
          <meta name="description" content={meta.description} />
        ) : null}
        {meta.noindex ? <meta name="robots" content="noindex" /> : null}
        {canonical ? <link rel="canonical" href={canonical} /> : null}
        <meta property="og:title" content={meta.title} />
        {meta.description ? (
          <meta property="og:description" content={meta.description} />
        ) : null}
        <meta property="og:site_name" content={config.name} />
        {canonical ? <meta property="og:url" content={canonical} /> : null}
        {image ? <meta property="og:image" content={image} /> : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@600;700&display=swap"
        />
        {config.logo ? (
          <link rel="icon" href={media(site, config.logo)} />
        ) : null}
        <link rel="stylesheet" href={href(site, site.cssFile)} />
      </head>
      <body>
        <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col bg-white shadow-[0_0_30px_rgba(0,0,0,.06)]">
          <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
            <div className="flex items-center gap-4 px-5 pt-3 sm:px-10 lg:py-2">
              <a href={href(site, "/")} className="shrink-0">
                {config.logo ? (
                  <img
                    src={media(site, config.logo)}
                    alt={config.name}
                    className="h-14 w-auto lg:h-16"
                  />
                ) : (
                  <>
                    <span className="block font-display text-[26px] leading-none tracking-wide text-stone-900">
                      {config.name}
                    </span>
                    {config.tagline ? (
                      <span className="mt-1.5 block text-[11px] tracking-[.3em] text-stone-400">
                        {config.tagline}
                      </span>
                    ) : null}
                  </>
                )}
              </a>
              <nav
                aria-label="主导航"
                className="ml-auto hidden items-center lg:flex"
              >
                <Nav site={site} current={meta.nav} />
              </nav>
              <a
                href={href(site, "/search/")}
                aria-label="搜索"
                className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-[var(--brand)] lg:ml-2"
              >
                <Icon d={ICONS.search} className="h-[18px] w-[18px]" />
              </a>
            </div>
            <nav
              aria-label="主导航"
              className="scrollbar-none -mb-px flex overflow-x-auto px-2 sm:px-7 lg:hidden"
            >
              <Nav site={site} current={meta.nav} />
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <Footer site={site} />
        </div>
      </body>
    </html>
  );
}

function PostMeta({ site, post }: { site: Site; post: Post }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-stone-400">
      <a
        href={href(site, categoryPath(post.category))}
        className="font-medium text-[var(--brand)] hover:underline"
      >
        {post.category}
      </a>
      <span aria-hidden="true">·</span>
      <time dateTime={post.date}>{formatDate(site, post.date)}</time>
    </p>
  );
}

export function PostCard({ site, post }: { site: Site; post: Post }) {
  const link = href(site, postPath(post));
  return (
    <article className="group mb-10 break-inside-avoid">
      {post.image ? (
        <a href={link} className="block overflow-hidden bg-stone-100">
          <img
            src={media(site, post.image)}
            alt=""
            loading="lazy"
            className="w-full transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </a>
      ) : (
        <div className="h-1 w-12 bg-[var(--brand)]" />
      )}
      <div className="pt-5">
        <PostMeta site={site} post={post} />
        <h2 className="mt-2 text-[23px] font-light leading-[1.4] text-stone-800">
          <a href={link} className="hover:text-[var(--brand)]">
            {post.title}
          </a>
        </h2>
        <p className="mt-3 line-clamp-5 text-[13.5px] leading-[1.9] text-stone-500">
          {post.excerpt}
        </p>
        <a
          href={link}
          className="mt-4 inline-flex items-center gap-1.5 border-t border-stone-200 pt-3 text-xs font-medium text-stone-500 hover:text-[var(--brand)]"
        >
          阅读全文 <Icon d={ICONS.arrow} className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}

function Hero({ site, post }: { site: Site; post: Post }) {
  const link = href(site, postPath(post));
  return (
    <section className="bg-[var(--brand-wash)]">
      <div
        className={`grid items-center gap-6 px-5 py-8 sm:px-10 sm:py-10 ${post.image ? "md:grid-cols-[1.25fr_1fr] md:gap-10" : ""}`}
      >
        {post.image ? (
          <a href={link} className="block overflow-hidden bg-stone-100">
            <img
              src={media(site, post.image)}
              alt=""
              className="aspect-[16/10] w-full object-cover"
            />
          </a>
        ) : null}
        <div>
          <p className="mb-3 text-xs font-bold tracking-[.3em] text-[var(--brand)]">
            头条
          </p>
          <h1 className="font-display text-[30px] leading-[1.35] text-stone-900 sm:text-[38px]">
            <a href={link} className="hover:text-[var(--brand)]">
              {post.title}
            </a>
          </h1>
          <p className="mt-4 line-clamp-4 text-[15px] leading-8 text-stone-600">
            {post.excerpt}
          </p>
          <div className="mt-5">
            <PostMeta site={site} post={post} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** 首頁最上方的橫幅圖（site.json 的 hero）。 */
function Banner({ site }: { site: Site }) {
  const hero = site.config.hero;
  if (!hero?.image) return null;
  const image = (
    <img
      src={media(site, hero.image)}
      alt={hero.alt ?? ""}
      className="mx-auto w-full max-w-[760px]"
    />
  );
  return (
    <section className="bg-[var(--brand-wash)] px-5 sm:px-10">
      {hero.link ? (
        <a
          href={hero.link.startsWith("/") ? href(site, hero.link) : hero.link}
          className="block"
        >
          {image}
        </a>
      ) : (
        image
      )}
    </section>
  );
}

function Pager({
  site,
  page,
  pages,
  pathFor,
}: {
  site: Site;
  page: number;
  pages: number;
  pathFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const item =
    "inline-flex h-10 items-center gap-1 border border-stone-200 px-4 text-sm text-stone-600 hover:border-[var(--brand)] hover:text-[var(--brand)]";
  return (
    <nav
      aria-label="分页"
      className="mt-4 flex items-center justify-center gap-4"
    >
      {page > 1 ? (
        <a href={href(site, pathFor(page - 1))} rel="prev" className={item}>
          <Icon d={ICONS.left} className="h-4 w-4" /> 上一页
        </a>
      ) : null}
      <span className="text-sm text-stone-400">
        第 {page} / {pages} 页
      </span>
      {page < pages ? (
        <a href={href(site, pathFor(page + 1))} rel="next" className={item}>
          下一页 <Icon d={ICONS.right} className="h-4 w-4" />
        </a>
      ) : null}
    </nav>
  );
}

export function ListPage({
  site,
  heading,
  total,
  posts,
  page,
  pages,
  pathFor,
  hero,
  banner,
}: {
  site: Site;
  heading?: string;
  total: number;
  posts: Post[];
  page: number;
  pages: number;
  pathFor: (page: number) => string;
  hero?: Post | null;
  banner?: boolean;
}) {
  return (
    <>
      {banner ? <Banner site={site} /> : null}
      {hero ? <Hero site={site} post={hero} /> : null}
      {heading ? (
        <div className="border-b border-stone-200 px-5 py-8 sm:px-10">
          <h1 className="font-display text-3xl text-stone-900">{heading}</h1>
          <p className="mt-2 text-sm text-stone-400">共 {total} 篇文章</p>
        </div>
      ) : null}
      <div className="px-5 py-10 sm:px-10">
        {posts.length === 0 && !hero ? (
          <p className="py-24 text-center text-stone-400">暂无文章。</p>
        ) : (
          <>
            <div className="gap-10 sm:columns-2 lg:columns-3">
              {posts.map(post => (
                <PostCard key={post.slug} site={site} post={post} />
              ))}
            </div>
            <Pager site={site} page={page} pages={pages} pathFor={pathFor} />
          </>
        )}
      </div>
    </>
  );
}

export function ArticlePage({
  site,
  post,
  related,
}: {
  site: Site;
  post: Post;
  related: Post[];
}) {
  return (
    <>
      <article className="mx-auto max-w-[760px] px-5 pb-6 pt-10 sm:pt-14">
        <div className="text-sm">
          <PostMeta site={site} post={post} />
        </div>
        <h1 className="mt-4 font-display text-[30px] leading-[1.4] text-stone-900 sm:text-[40px]">
          {post.title}
        </h1>
        {post.image ? (
          <img
            src={media(site, post.image)}
            alt=""
            className="mt-8 w-full bg-stone-100"
          />
        ) : null}
        <div className="post-body mt-8">
          {post.blocks.map((block, index) =>
            block.type === "p" ? (
              <p key={index}>{block.text}</p>
            ) : (
              <figure key={index}>
                <img
                  src={media(site, block.url)}
                  alt={block.alt}
                  loading="lazy"
                />
                {block.caption ? (
                  <figcaption>{block.caption}</figcaption>
                ) : null}
              </figure>
            )
          )}
        </div>
        {post.tags.length ? (
          <ul className="mt-10 flex flex-wrap gap-2">
            {post.tags.map(tag => (
              <li key={tag}>
                <a
                  href={`${href(site, "/search/")}?q=${encodeURIComponent(tag)}`}
                  className="inline-block border border-stone-200 px-3 py-1 text-xs text-stone-500 hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  {tag}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {post.source ? (
          <p className="mt-8 break-all border-t border-stone-200 pt-5 text-sm text-stone-400">
            原文链接：
            <a
              href={post.source}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="hover:text-[var(--brand)] hover:underline"
            >
              {post.source}
            </a>
          </p>
        ) : null}
      </article>
      {related.length ? (
        <section className="mt-10 border-t border-stone-200 px-5 pt-10 sm:px-10">
          <h2 className="text-xs font-bold tracking-[.3em] text-[var(--brand)]">
            相关文章
          </h2>
          <ul className="mt-6 grid gap-8 sm:grid-cols-3">
            {related.map(item => (
              <li key={item.slug}>
                <a href={href(site, postPath(item))} className="group block">
                  {item.image ? (
                    <img
                      src={media(site, item.image)}
                      alt=""
                      loading="lazy"
                      className="aspect-[16/10] w-full bg-stone-100 object-cover"
                    />
                  ) : null}
                  <p className="mt-3 text-[17px] leading-7 text-stone-800 group-hover:text-[var(--brand)]">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {formatDate(site, item.date)}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** 搜尋頁：結果由瀏覽器端的 search.js 依 search-index.json 產生。 */
export function SearchPage({ site }: { site: Site }) {
  return (
    <>
      <div className="border-b border-stone-200 px-5 py-8 sm:px-10">
        <h1 className="font-display text-3xl text-stone-900">搜索</h1>
        <form
          role="search"
          action={href(site, "/search/")}
          className="mt-5 flex max-w-xl gap-2"
        >
          <input
            type="search"
            name="q"
            id="search-input"
            placeholder="输入关键词"
            aria-label="搜索文章"
            className="h-11 min-w-0 flex-1 border border-stone-300 px-4 text-base"
          />
          <button
            type="submit"
            className="h-11 shrink-0 bg-stone-900 px-6 text-sm text-white hover:bg-[var(--brand)]"
          >
            搜索
          </button>
        </form>
        <p id="search-status" className="mt-3 text-sm text-stone-400" />
      </div>
      <div className="px-5 py-10 sm:px-10">
        <div
          id="search-results"
          data-base={site.base}
          className="gap-10 sm:columns-2 lg:columns-3"
        />
        <noscript>
          <p className="py-10 text-center text-stone-400">
            搜索功能需要启用 JavaScript。
          </p>
        </noscript>
      </div>
      <script src={href(site, site.searchFile)} defer />
    </>
  );
}

export function NotFoundPage({ site }: { site: Site }) {
  return (
    <div className="px-5 py-28 text-center">
      <p className="font-display text-2xl text-stone-800">找不到这个页面</p>
      <a
        href={href(site, "/")}
        className="mt-5 inline-block text-sm text-[var(--brand)] hover:underline"
      >
        返回首页
      </a>
    </div>
  );
}
