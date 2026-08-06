import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowRight, ChevronLeft, ChevronRight, Newspaper } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";

const PAGE_SIZE = 9;

function formatDate(value: Date | string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function NewsHeader() {
  return (
    <header className="border-b border-stone-200/80 bg-[rgba(255,253,249,.9)] backdrop-blur-xl">
      <div className="news-shell flex h-[70px] items-center justify-between">
        <Link href="/" className="group inline-flex items-center gap-3 text-stone-950" aria-label="Newsroom home">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-950 text-[11px] font-semibold tracking-[0.16em] text-stone-50 transition-transform duration-200 group-hover:scale-105">N</span>
          <span className="font-display text-[21px] tracking-[-0.045em]">Newsroom</span>
        </Link>
        <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 transition-colors hover:text-stone-950">Admin</Link>
      </div>
    </header>
  );
}

export default function Home() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const selectedCategory = new URLSearchParams(search).get("category") || undefined;
  const [page, setPage] = useState(1);
  const categories = trpc.news.categories.useQuery();
  const listInput = useMemo(() => ({ page, pageSize: PAGE_SIZE, categorySlug: selectedCategory }), [page, selectedCategory]);
  const articles = trpc.news.list.useQuery(listInput);

  useEffect(() => setPage(1), [selectedCategory]);

  const changeCategory = (slug?: string) => {
    setLocation(slug ? `/?category=${encodeURIComponent(slug)}` : "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const totalPages = Math.max(1, Math.ceil((articles.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-[#fffdf9] text-stone-900">
      <NewsHeader />
      <main>
        <section className="news-shell pb-10 pt-16 sm:pb-12 sm:pt-24">
          <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">Independent journalism</p>
          <div className="max-w-4xl">
            <h1 className="font-display text-[clamp(3rem,8vw,6.65rem)] leading-[0.88] tracking-[-0.06em] text-stone-950">Stories worth<br className="hidden sm:block" /> your attention.</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">A considered collection of reporting and ideas, curated for clear reading.</p>
          </div>
        </section>

        <section className="border-y border-stone-200/80 bg-stone-50/60">
          <div className="news-shell flex min-h-[66px] items-center gap-2 overflow-x-auto py-3 scrollbar-none">
            <button onClick={() => changeCategory()} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all ${!selectedCategory ? "bg-stone-950 text-white shadow-sm" : "text-stone-500 hover:bg-white hover:text-stone-950"}`}>All stories</button>
            {categories.isLoading
              ? Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-8 w-20 rounded-full" key={index} />)
              : categories.isError
                ? <button onClick={() => categories.refetch()} className="whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold text-stone-500 hover:bg-white hover:text-stone-950">Reload categories</button>
                : categories.data?.map(category => (
                    <button key={category.id} onClick={() => changeCategory(category.slug)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all ${selectedCategory === category.slug ? "bg-stone-950 text-white shadow-sm" : "text-stone-500 hover:bg-white hover:text-stone-950"}`}>{category.name}</button>
                  ))}
          </div>
        </section>

        <section className="news-shell py-12 sm:py-16">
          <div className="mb-9 flex items-end justify-between gap-5 border-b border-stone-200 pb-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.19em] text-stone-400">Latest reporting</p>
              <h2 className="mt-2 font-display text-3xl tracking-[-0.045em] text-stone-950">{selectedCategory ? categories.data?.find(category => category.slug === selectedCategory)?.name ?? "Stories" : "All stories"}</h2>
            </div>
            {!articles.isLoading && <p className="pb-1 text-xs text-stone-500">{articles.data?.total ?? 0} published</p>}
          </div>

          {articles.isLoading ? (
            <div className="grid gap-x-7 gap-y-12 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <article key={index}><Skeleton className="aspect-[1.35] w-full rounded-sm" /><Skeleton className="mt-5 h-4 w-24" /><Skeleton className="mt-3 h-8 w-5/6" /><Skeleton className="mt-3 h-12 w-full" /></article>)}</div>
          ) : articles.isError ? (
            <div className="border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center"><Newspaper className="mx-auto h-7 w-7 text-stone-400" strokeWidth={1.2} /><h3 className="mt-5 font-display text-3xl tracking-[-0.04em] text-stone-900">Stories could not be loaded.</h3><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">Please try the request again.</p><Button variant="outline" size="sm" className="mt-6" onClick={() => articles.refetch()}>Retry</Button></div>
          ) : articles.data?.items.length ? (
            <div className="grid gap-x-7 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
              {articles.data.items.map(article => (
                <article key={article.id} className="group flex flex-col">
                  <Link href={`/articles/${article.slug}`} className="block overflow-hidden rounded-sm bg-stone-100">
                    {article.coverImage ? <img src={article.coverImage.storageUrl} alt={article.coverImage.altText || article.title} className="aspect-[1.35] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]" /> : <div className="flex aspect-[1.35] items-end bg-[linear-gradient(140deg,#eee9e0_0%,#faf8f4_52%,#d9d0c0_100%)] p-5"><Newspaper className="h-7 w-7 text-stone-500" strokeWidth={1.35} /></div>}
                  </Link>
                  <div className="pt-5">
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500"><span>{article.category?.name ?? "News"}</span><span className="h-0.5 w-0.5 rounded-full bg-stone-400" /><time>{formatDate(article.publishedAt)}</time></div>
                    <h3 className="font-display text-[1.72rem] leading-[1.03] tracking-[-0.04em] text-stone-950"><Link href={`/articles/${article.slug}`} className="transition-colors hover:text-amber-800">{article.title}</Link></h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">{article.summary}</p>
                    <Link href={`/articles/${article.slug}`} className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-stone-950 transition-colors hover:text-amber-800">Read story <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-stone-300 bg-stone-50 px-6 py-20 text-center"><Newspaper className="mx-auto h-7 w-7 text-stone-400" strokeWidth={1.2} /><h3 className="mt-5 font-display text-3xl tracking-[-0.04em] text-stone-900">No published stories yet.</h3><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">Published articles will appear here with their category, imagery and source reference.</p></div>
          )}

          {articles.data && articles.data.total > PAGE_SIZE ? <nav className="mt-14 flex items-center justify-between border-t border-stone-200 pt-6" aria-label="Article pagination"><Button variant="ghost" size="sm" disabled={page === 1} onClick={() => { setPage(current => current - 1); window.scrollTo({ top: 340, behavior: "smooth" }); }} className="gap-2 text-stone-600"><ChevronLeft className="h-4 w-4" /> Previous</Button><span className="text-xs text-stone-500">Page {page} of {totalPages}</span><Button variant="ghost" size="sm" disabled={page === totalPages} onClick={() => { setPage(current => current + 1); window.scrollTo({ top: 340, behavior: "smooth" }); }} className="gap-2 text-stone-600">Next <ChevronRight className="h-4 w-4" /></Button></nav> : null}
        </section>
      </main>
      <footer className="border-t border-stone-200 py-9"><div className="news-shell flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500"><span>© {new Date().getFullYear()} Newsroom</span><span>Thoughtful reporting, clearly presented.</span></div></footer>
    </div>
  );
}
