import { trpc } from "@/lib/trpc";
import { SITE_CATEGORIES, siteCategorySlug } from "@shared/const";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

export function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function categoryHref(name: string) {
  return `/category/${siteCategorySlug(name)}`;
}

function NavLink({ href, label }: { href: string; label: string }) {
  const [location] = useLocation();
  const active = location === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative shrink-0 px-3 py-2 text-[15px] transition-colors hover:text-[var(--brand)] ${active ? "font-medium text-[var(--brand)]" : "text-stone-600"}`}
    >
      {label}
      {active ? (
        <span className="absolute inset-x-3 -bottom-px h-0.5 bg-[var(--brand)]" />
      ) : null}
    </Link>
  );
}

function SearchBox() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [location, navigate] = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (!query) return;
    navigate(`/search?q=${encodeURIComponent(query)}`);
    setOpen(false);
  };
  if (!open)
    return (
      <button
        type="button"
        aria-label="搜索"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-[var(--brand)]"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>
    );
  return (
    <form
      onSubmit={submit}
      role="search"
      className="flex h-10 items-center gap-1 rounded-full border border-stone-300 bg-white pl-4 pr-1"
    >
      <input
        autoFocus
        type="search"
        value={value}
        onChange={event => setValue(event.target.value)}
        placeholder="搜索文章"
        aria-label="搜索文章"
        className="w-36 bg-transparent text-sm outline-none placeholder:text-stone-400 sm:w-48"
      />
      <button
        type="button"
        aria-label="关闭搜索"
        onClick={() => setOpen(false)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:text-stone-700"
      >
        <X className="h-4 w-4" />
      </button>
    </form>
  );
}

function Footer({ name }: { name: string }) {
  const recent = trpc.site.recent.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return (
    <footer className="mt-16 bg-stone-900 text-stone-300">
      <div className="grid gap-10 px-5 py-12 sm:px-10 md:grid-cols-[1.2fr_2fr_1fr]">
        <div>
          <p className="font-display text-2xl text-white">{name}</p>
          <p className="mt-3 text-sm leading-7 text-stone-400">
            本站文章均为已获授权的转载与整理，文末附原文链接。
          </p>
        </div>
        <div>
          <p className="text-xs font-bold tracking-[.2em] text-[var(--brand-soft)]">
            近期文章
          </p>
          <ul className="mt-4 space-y-3">
            {recent.data?.length ? (
              recent.data.map(post => (
                <li key={post.id} className="text-sm leading-6">
                  <Link
                    href={`/post/${post.id}`}
                    className="text-stone-200 hover:text-[var(--brand-soft)]"
                  >
                    {post.title}
                  </Link>
                  <span className="ml-2 text-xs text-stone-500">
                    {formatDate(post.publishedAt)}
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
            {SITE_CATEGORIES.map(category => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  className="text-stone-300 hover:text-[var(--brand-soft)]"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-5 text-xs text-stone-500 sm:px-10">
        © {new Date().getFullYear()} {name} · All Rights Reserved
      </div>
    </footer>
  );
}

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const info = trpc.site.info.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const name = info.data?.name ?? "新闻聚焦";
  return (
    <div className="site min-h-screen bg-[#efefef] text-stone-700">
      <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col bg-white shadow-[0_0_30px_rgba(0,0,0,.06)]">
        <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-4 px-5 pt-3 sm:px-10 lg:py-3">
            <Link href="/" className="shrink-0">
              <span className="block font-display text-[26px] leading-none tracking-wide text-stone-900">
                {name}
              </span>
              {info.data?.tagline ? (
                <span className="mt-1.5 block text-[11px] tracking-[.3em] text-stone-400">
                  {info.data.tagline}
                </span>
              ) : null}
            </Link>
            <nav
              aria-label="主导航"
              className="ml-auto hidden items-center lg:flex"
            >
              <NavLink href="/" label="首页" />
              {SITE_CATEGORIES.map(category => (
                <NavLink
                  key={category.slug}
                  href={`/category/${category.slug}`}
                  label={category.name}
                />
              ))}
            </nav>
            <div className="ml-auto lg:ml-2">
              <SearchBox />
            </div>
          </div>
          <nav
            aria-label="主导航"
            className="scrollbar-none -mb-px flex overflow-x-auto px-2 sm:px-7 lg:hidden"
          >
            <NavLink href="/" label="首页" />
            {SITE_CATEGORIES.map(category => (
              <NavLink
                key={category.slug}
                href={`/category/${category.slug}`}
                label={category.name}
              />
            ))}
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <Footer name={name} />
      </div>
    </div>
  );
}
