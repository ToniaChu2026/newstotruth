import PostCard, { PostMeta } from "@/components/site/PostCard";
import SiteLayout from "@/components/site/SiteLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { siteCategoryBySlug } from "@shared/const";
import type { SitePostSummary } from "@shared/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams, useSearch } from "wouter";

function Hero({ post }: { post: SitePostSummary }) {
  const href = `/post/${post.id}`;
  return (
    <section className="bg-[var(--brand-wash)]">
      <div
        className={`grid items-center gap-6 px-5 py-8 sm:px-10 sm:py-10 ${post.image ? "md:grid-cols-[1.25fr_1fr] md:gap-10" : ""}`}
      >
        {post.image ? (
          <Link href={href} className="block overflow-hidden bg-stone-100">
            <img
              src={post.image}
              alt=""
              className="aspect-[16/10] w-full object-cover"
            />
          </Link>
        ) : null}
        <div>
          <p className="mb-3 text-xs font-bold tracking-[.3em] text-[var(--brand)]">
            头条
          </p>
          <h1 className="font-display text-[30px] leading-[1.35] text-stone-900 sm:text-[38px]">
            <Link href={href} className="hover:text-[var(--brand)]">
              {post.title}
            </Link>
          </h1>
          <p className="mt-4 line-clamp-4 text-[15px] leading-8 text-stone-600">
            {post.excerpt}
          </p>
          <div className="mt-5">
            <PostMeta post={post} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Pager({
  page,
  pages,
  hrefFor,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
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
        <Link href={hrefFor(page - 1)} className={item}>
          <ChevronLeft className="h-4 w-4" /> 上一页
        </Link>
      ) : null}
      <span className="text-sm text-stone-400">
        第 {page} / {pages} 页
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={item}>
          下一页 <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </nav>
  );
}

export default function HomePage({ mode }: { mode: "home" | "search" }) {
  const params = useParams<{ slug?: string }>();
  const search = new URLSearchParams(useSearch());
  const page = Math.max(1, Number(search.get("page")) || 1);
  const query = mode === "search" ? (search.get("q") ?? "").trim() : "";
  const category = params.slug ? siteCategoryBySlug(params.slug) : null;
  const unknownCategory = Boolean(params.slug) && !category;

  const posts = trpc.site.list.useQuery(
    { category: category?.slug, query: query || undefined, page },
    { enabled: !unknownCategory, refetchOnWindowFocus: false, retry: false }
  );
  const info = trpc.site.info.useQuery(undefined, { staleTime: Infinity });

  const heading = category?.name ?? (mode === "search" ? `搜索：${query}` : "");
  useEffect(() => {
    if (!info.data) return;
    document.title = heading ? `${heading} | ${info.data.name}` : info.data.name;
  }, [heading, info.data]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, params.slug, query]);

  const hrefFor = (target: number) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (target > 1) next.set("page", String(target));
    const base = category
      ? `/category/${category.slug}`
      : mode === "search"
        ? "/search"
        : "/";
    const qs = next.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const items = posts.data?.items ?? [];
  const showHero = mode === "home" && !category && page === 1 && items.length > 0;
  const grid = showHero ? items.slice(1) : items;

  return (
    <SiteLayout>
      {showHero ? <Hero post={items[0]} /> : null}
      {heading ? (
        <div className="border-b border-stone-200 px-5 py-8 sm:px-10">
          <h1 className="font-display text-3xl text-stone-900">{heading}</h1>
          {posts.data ? (
            <p className="mt-2 text-sm text-stone-400">
              共 {posts.data.total} 篇文章
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="px-5 py-10 sm:px-10">
        {unknownCategory ? (
          <Empty text="没有这个栏目。" />
        ) : posts.isLoading ? (
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <Skeleton className="mt-5 h-6 w-4/5" />
                <Skeleton className="mt-3 h-16 w-full" />
              </div>
            ))}
          </div>
        ) : posts.isError ? (
          <div className="py-20 text-center">
            <p className="text-stone-500">文章加载失败，请稍后再试。</p>
            <button
              type="button"
              onClick={() => posts.refetch()}
              className="mt-4 border border-stone-300 px-5 py-2 text-sm hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              重新加载
            </button>
          </div>
        ) : items.length === 0 ? (
          <Empty
            text={
              mode === "search"
                ? query
                  ? "没有找到相关文章。"
                  : "请输入搜索关键词。"
                : "暂无文章。"
            }
          />
        ) : (
          <>
            <div className="gap-10 sm:columns-2 lg:columns-3">
              {grid.map(post => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            <Pager
              page={posts.data!.page}
              pages={posts.data!.pages}
              hrefFor={hrefFor}
            />
          </>
        )}
      </div>
    </SiteLayout>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-24 text-center text-stone-400">{text}</p>;
}
