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
  /** 下載表單的瀏覽器端程式（有 downloads 的頁面才載入）。 */
  downloadFile: string;
  /** 本站圖片（/media/…）的像素寬高；寫進 <img> 讓瀏覽器先留好位置。 */
  sizes: Map<string, { width: number; height: number }>;
};

export type PageMeta = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  noindex?: boolean;
  /** 目前所在的導覽項目：首頁是 "/"，分類頁是分類的 slug。 */
  nav?: string;
  /** 文章頁才有：發佈時間、分類與原文連結，用於分享預覽與搜尋引擎的結構化資料。 */
  article?: { published: string; section: string; source?: string | null };
  /** 這一頁最後更新的日期（ISO 時間），寫進 sitemap。 */
  lastmod?: string;
};

export function href(site: Site, path: string) {
  return `${site.base}${path}`;
}
/** 圖片網址：本站媒體加上前綴，外部 https 圖片原樣使用。 */
export function media(site: Site, url: string) {
  return url.startsWith("/") ? href(site, url) : url;
}
/** <img> 的 width / height 屬性；不知道尺寸的圖（外部圖片）不加。 */
export function dims(site: Site, url: string | null | undefined) {
  const size = url ? site.sizes.get(url) : undefined;
  return size ? { width: size.width, height: size.height } : {};
}
/** 文章網址（已編碼，可直接放進連結）：/<slug>/。 */
export function postPath(post: Pick<Post, "slug">) {
  return `/${encodeURIComponent(post.slug)}/`;
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
            className={`relative shrink-0 border-r border-black/[.07] px-4 py-2 text-[15px] transition-colors last:border-r-0 hover:text-[var(--brand)] lg:px-5 lg:py-3 ${active ? "font-medium text-[var(--brand)]" : "text-stone-600"}`}
          >
            {item.label}
            {active ? (
              <span className="absolute inset-x-4 -bottom-px h-0.5 bg-[var(--brand)] lg:hidden" />
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
  const absolute = (url?: string | null) =>
    url
      ? url.startsWith("/")
        ? site.origin
          ? `${site.origin}${url}`
          : null
        : url
      : null;
  // 沒有自己圖片的頁面（列表頁、沒配圖的文章）分享時用網站標誌。
  const ownImage = absolute(meta.image);
  const logo = absolute(config.logo);
  const image = ownImage ?? logo;
  const structured = !canonical
    ? null
    : meta.article
      ? {
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          headline: meta.title.replace(` | ${config.name}`, ""),
          ...(meta.description ? { description: meta.description } : {}),
          ...(ownImage ? { image: [ownImage] } : {}),
          datePublished: meta.article.published,
          articleSection: meta.article.section,
          inLanguage: "zh-Hans",
          mainEntityOfPage: canonical,
          ...(meta.article.source ? { isBasedOn: meta.article.source } : {}),
          publisher: {
            "@type": "Organization",
            name: config.name,
            ...(logo ? { logo: { "@type": "ImageObject", url: logo } } : {}),
          },
        }
      : meta.path === "/"
        ? {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: config.name,
            url: canonical,
            inLanguage: "zh-Hans",
            ...(meta.description ? { description: meta.description } : {}),
          }
        : null;
  return (
    <html lang="zh-Hans">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {config.gtm ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${config.gtm}');`,
            }}
          />
        ) : null}
        <title>{meta.title}</title>
        {meta.description ? (
          <meta name="description" content={meta.description} />
        ) : null}
        {meta.noindex ? <meta name="robots" content="noindex" /> : null}
        {site.config.searchIndex === "baidu-only" ? (
          <>
            <meta name="googlebot" content="noindex, nofollow" />
            <meta name="bingbot" content="noindex, nofollow" />
          </>
        ) : null}
        {canonical ? <link rel="canonical" href={canonical} /> : null}
        <meta property="og:title" content={meta.title} />
        {meta.description ? (
          <meta property="og:description" content={meta.description} />
        ) : null}
        <meta property="og:site_name" content={config.name} />
        <meta
          property="og:type"
          content={meta.article ? "article" : "website"}
        />
        <meta property="og:locale" content="zh_CN" />
        {canonical ? <meta property="og:url" content={canonical} /> : null}
        {image ? <meta property="og:image" content={image} /> : null}
        {meta.article ? (
          <>
            <meta
              property="article:published_time"
              content={meta.article.published}
            />
            <meta property="article:section" content={meta.article.section} />
          </>
        ) : null}
        <meta
          name="twitter:card"
          content={ownImage ? "summary_large_image" : "summary"}
        />
        {site.origin ? (
          <link
            rel="alternate"
            type="application/rss+xml"
            title={config.name}
            href={`${site.origin}/feed.xml`}
          />
        ) : null}
        {structured ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
            }}
          />
        ) : null}
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
        {config.gtm ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${config.gtm}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col bg-white shadow-[0_0_30px_rgba(0,0,0,.06)]">
          <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
            <div className="flex items-center gap-4 px-5 pt-3 sm:px-10 lg:py-2">
              <a href={href(site, "/")} className="shrink-0">
                {config.logo ? (
                  <img
                    src={media(site, config.logo)}
                    alt={config.name}
                    className="h-14 w-auto lg:h-16"
                    {...dims(site, config.logo)}
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
                className="ml-6 hidden items-center lg:flex"
              >
                <Nav site={site} current={meta.nav} />
              </nav>
              <a
                href={href(site, "/search/")}
                aria-label="搜索"
                className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-[var(--brand)]"
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
            {...dims(site, post.image)}
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
              {...dims(site, post.image)}
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
  // 最寬 760px，但不超過原圖的寬度：放大超過原圖只會變模糊。
  const natural = site.sizes.get(hero.image)?.width;
  const image = (
    <img
      src={media(site, hero.image)}
      alt={hero.alt ?? ""}
      className="mx-auto w-full"
      style={{ maxWidth: `${Math.min(760, natural ?? 760)}px` }}
      {...dims(site, hero.image)}
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
  posts,
  page,
  pages,
  pathFor,
  hero,
  banner,
}: {
  site: Site;
  posts: Post[];
  page: number;
  pages: number;
  pathFor: (page: number) => string;
  hero?: Post | null;
  banner?: boolean;
}) {
  return (
    <>
      {hero ? null : (
        <h1 className="sr-only">
          {page === 1 ? site.config.name : `${site.config.name} 第 ${page} 页`}
        </h1>
      )}
      {banner ? <Banner site={site} /> : null}
      {hero ? <Hero site={site} post={hero} /> : null}
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

/** 分類頁的一列：左文右圖（手機上圖在上面；沒有首圖時整列是文字）。 */
function CategoryRow({ site, post }: { site: Site; post: Post }) {
  const link = href(site, postPath(post));
  return (
    <article
      className={`group grid gap-5 border-b border-stone-200 pb-8 ${post.image ? "sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:gap-7" : ""}`}
    >
      {post.image ? (
        <a
          href={link}
          className="block self-start overflow-hidden bg-stone-100 sm:order-last"
        >
          <img
            src={media(site, post.image)}
            alt=""
            loading="lazy"
            className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            {...dims(site, post.image)}
          />
        </a>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <h2 className="text-[21px] font-light leading-[1.45] text-stone-800">
          <a href={link} className="hover:text-[var(--brand)]">
            {post.title}
          </a>
        </h2>
        {post.excerpt ? (
          <p className="mt-3 line-clamp-4 text-[13.5px] leading-[1.9] text-stone-500">
            {post.excerpt}
          </p>
        ) : null}
        <div className="min-h-4 flex-1" />
        <div className="flex items-center justify-between border-t border-stone-200 pt-3 text-xs text-stone-400">
          <time dateTime={post.date}>{formatDate(site, post.date)}</time>
          <a
            href={link}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--brand)] hover:underline"
          >
            阅读全文 <Icon d={ICONS.arrow} className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

function SidebarHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-b border-stone-200 pb-2 text-[15px] font-medium text-stone-700">
      {children}
    </h2>
  );
}

/** 分類頁：標題列加麵包屑，左邊是左文右圖的列表，右邊是搜尋、近期文章與栏目。 */
export function CategoryPage({
  site,
  name,
  posts,
  page,
  pages,
  pathFor,
  counts,
}: {
  site: Site;
  name: string;
  posts: Post[];
  page: number;
  pages: number;
  pathFor: (page: number) => string;
  counts: Array<{ name: string; count: number }>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[var(--brand-wash)] px-5 py-7 sm:px-10">
        <h1 className="text-[26px] text-stone-600">{name}</h1>
        <nav aria-label="位置" className="text-xs text-stone-400">
          <a href={href(site, "/")} className="hover:text-[var(--brand)]">
            首页
          </a>
          <span className="mx-2">›</span>
          <span className="text-stone-500">{name}</span>
        </nav>
      </div>
      <div className="px-5 py-10 sm:px-10 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-12">
        <div>
          {posts.length ? (
            <div className="space-y-8">
              {posts.map(post => (
                <CategoryRow key={post.slug} site={site} post={post} />
              ))}
            </div>
          ) : (
            <p className="py-24 text-center text-stone-400">暂无文章。</p>
          )}
          <div className="mt-10">
            <Pager site={site} page={page} pages={pages} pathFor={pathFor} />
          </div>
        </div>
        <aside className="mt-14 space-y-10 lg:mt-0">
          <section>
            <SidebarHeading>搜索</SidebarHeading>
            <form
              role="search"
              action={href(site, "/search/")}
              className="mt-4 flex"
            >
              <input
                type="search"
                name="q"
                placeholder="输入关键词"
                aria-label="搜索文章"
                className="h-10 min-w-0 flex-1 border border-stone-300 px-3 text-sm"
              />
              <button
                type="submit"
                aria-label="搜索"
                className="h-10 shrink-0 bg-stone-800 px-3 text-white hover:bg-[var(--brand)]"
              >
                <Icon d={ICONS.search} className="h-4 w-4" />
              </button>
            </form>
          </section>
          {site.recent.length ? (
            <section>
              <SidebarHeading>近期文章</SidebarHeading>
              <ul className="mt-4 space-y-4">
                {site.recent.map(post => (
                  <li key={post.slug}>
                    <a
                      href={href(site, postPath(post))}
                      className="group flex gap-3"
                    >
                      {post.image ? (
                        <img
                          src={media(site, post.image)}
                          alt=""
                          loading="lazy"
                          width={56}
                          height={56}
                          className="h-14 w-14 shrink-0 bg-stone-100 object-cover"
                        />
                      ) : null}
                      <span className="min-w-0 border-l-2 border-[var(--brand-soft)] pl-3">
                        <span className="line-clamp-2 text-[13.5px] leading-6 text-stone-700 group-hover:text-[var(--brand)]">
                          {post.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-400">
                          {formatDate(site, post.date)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <SidebarHeading>栏目</SidebarHeading>
            <ul className="mt-4 divide-y divide-white bg-[var(--brand-wash)]">
              {counts.map(item => (
                <li key={item.name}>
                  <a
                    href={href(site, categoryPath(item.name))}
                    aria-current={item.name === name ? "page" : undefined}
                    className={`flex items-center justify-between px-4 py-2.5 text-sm hover:text-[var(--brand)] ${item.name === name ? "font-medium text-[var(--brand)]" : "text-stone-600"}`}
                  >
                    {item.name}
                    <span className="text-xs text-stone-400">{item.count}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

const INLINE_LINK = /\[([^\[\]\n]+)\]\((https:\/\/[^\s()]+)\)/g;

/** 段落文字；[文字](https://…) 會變成連結，其餘原樣輸出。 */
function inline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_LINK)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <a
        key={match.index}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
      >
        {match[1]}
      </a>
    );
    last = match.index + match[0].length;
  }
  if (!parts.length) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
/** 去掉連結語法，只留文字（用於摘要與搜尋索引）。 */
export function plainText(text: string) {
  return text.replace(INLINE_LINK, "$1");
}

function PostBody({ site, blocks }: { site: Site; blocks: Post["blocks"] }) {
  return (
    <div className="post-body mt-8">
      {blocks.map((block, index) =>
        block.type === "p" ? (
          <p key={index}>{inline(block.text)}</p>
        ) : block.type === "h" ? (
          <h2 key={index}>{block.text}</h2>
        ) : (
          <figure key={index}>
            <img
              src={media(site, block.url)}
              alt={block.alt}
              loading="lazy"
              {...dims(site, block.url)}
            />
            {block.caption ? <figcaption>{block.caption}</figcaption> : null}
          </figure>
        )
      )}
    </div>
  );
}

/** 獨立頁面（content/pages/）：標題列加麵包屑，下面是置中的圖片與正文。 */
export function StaticPage({ site, page }: { site: Site; page: Post }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[var(--brand-wash)] px-5 py-7 sm:px-10">
        <h1 className="text-[22px] leading-[1.5] text-stone-600 sm:text-[26px]">
          {page.title}
        </h1>
        <nav aria-label="位置" className="text-xs text-stone-400">
          <a href={href(site, "/")} className="hover:text-[var(--brand)]">
            首页
          </a>
        </nav>
      </div>
      <article className="mx-auto max-w-[760px] px-5 pb-6 pt-10">
        {page.image ? (
          <figure>
            <img
              src={media(site, page.image)}
              alt={page.caption ?? ""}
              className="mx-auto max-w-full"
              {...dims(site, page.image)}
            />
            {page.caption ? (
              <figcaption className="mt-2.5 text-center text-[14px] leading-7 text-stone-500">
                {page.caption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
        <PostBody site={site} blocks={page.blocks} />
        {page.downloads?.length ? (
          <DownloadForm site={site} files={page.downloads} />
        ) : null}
      </article>
    </>
  );
}

/**
 * 下載表單：訪客留下電子郵件後才顯示下載連結。
 * download.js 把郵件送到 /api/subscribe（Cloudflare Pages Function，存進 D1），
 * 不論是否存成功都顯示連結，讓讀者拿得到檔案。
 */
function DownloadForm({ site, files }: { site: Site; files: string[] }) {
  return (
    <section
      id="download"
      className="mt-10 border border-[var(--brand)]/30 bg-[var(--brand-wash)] px-5 py-7 sm:px-8"
    >
      <h2 className="text-[20px] font-medium text-stone-800">
        下载全文（PDF）
      </h2>
      <form
        id="download-form"
        method="post"
        action={href(site, "/api/subscribe")}
        className="mt-4"
        noValidate
      >
        <p className="text-[15px] leading-7 text-stone-600">
          请留下您的电子邮箱，提交后即可下载。
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            maxLength={254}
            placeholder="您的电子邮箱"
            aria-label="电子邮箱"
            className="h-11 min-w-0 flex-1 border border-stone-300 bg-white px-4 text-base"
          />
          <button
            type="submit"
            className="h-11 shrink-0 bg-stone-900 px-6 text-sm text-white hover:bg-[var(--brand)] disabled:opacity-60"
          >
            获取下载链接
          </button>
        </div>
        {/* 防止機器人：真人看不到這一欄，填了就當成垃圾提交。 */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px opacity-0"
        />
        <p
          id="download-error"
          role="alert"
          className="mt-2 min-h-5 text-sm text-red-700"
        />
        <p className="text-xs leading-6 text-stone-500">
          提交即表示您同意接收本站寄出的电子邮件，可随时退订；您的邮箱不会公开。
        </p>
      </form>
      <div id="download-links" hidden>
        <p className="mt-4 text-[15px] leading-7 text-stone-600">
          谢谢！请点击下载：
        </p>
        <ul className="mt-3 space-y-2">
          {files.map(name => (
            <li key={name}>
              <a
                href={href(site, `/downloads/${encodeURIComponent(name)}`)}
                download={name}
                className="inline-flex items-center gap-2 text-[16px] text-[var(--brand)] hover:underline"
              >
                <Icon d={ICONS.arrow} className="h-4 w-4 rotate-90" />《
                {name.replace(/\.[a-z0-9]+$/i, "")}》
              </a>
            </li>
          ))}
        </ul>
      </div>
      <noscript>
        <p className="mt-3 text-sm text-stone-500">下载需要启用 JavaScript。</p>
      </noscript>
      <script src={href(site, site.downloadFile)} defer />
    </section>
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
          <figure className="mt-8">
            <img
              src={media(site, post.image)}
              alt={post.caption ?? ""}
              className="w-full bg-stone-100"
              {...dims(site, post.image)}
            />
            {post.caption ? (
              <figcaption className="mt-2.5 text-[14px] leading-7 text-stone-500">
                {post.caption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
        <PostBody site={site} blocks={post.blocks} />
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
          <ul className="mt-4 divide-y divide-stone-200">
            {related.map(item => (
              <li key={item.slug}>
                <a
                  href={href(site, postPath(item))}
                  className="block py-3 text-[17px] leading-7 text-stone-800 hover:text-[var(--brand)]"
                >
                  {item.title}
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
