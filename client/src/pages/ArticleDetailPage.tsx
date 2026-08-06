import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CircleAlert, ExternalLink } from "lucide-react";
import { Link, useRoute } from "wouter";

function formatDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value)) : "";
}

function ArticleHeader() {
  return <header className="border-b border-stone-200/80 bg-[rgba(255,253,249,.9)] backdrop-blur-xl"><div className="news-shell flex h-[70px] items-center justify-between"><Link href="/" className="inline-flex items-center gap-3 text-stone-950"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-950 text-[11px] font-semibold tracking-[0.16em] text-stone-50">N</span><span className="font-display text-[21px] tracking-[-0.045em]">Newsroom</span></Link><Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 transition-colors hover:text-stone-950">Admin</Link></div></header>;
}

function ArticleMessage({ error, retry }: { error?: boolean; retry?: () => void }) {
  return <div className="min-h-screen bg-[#fffdf9]"><ArticleHeader /><main className="article-shell py-24 text-center">{error && <CircleAlert className="mx-auto h-7 w-7 text-stone-400" />}<h1 className="mt-4 font-display text-5xl tracking-[-.05em]">{error ? "Story could not be loaded." : "Story unavailable."}</h1><p className="mt-4 text-stone-500">{error ? "Please try the request again." : "This article is not available to the public."}</p>{error && retry ? <Button variant="outline" className="mt-8" onClick={retry}>Retry</Button> : <Button asChild variant="outline" className="mt-8"><Link href="/">Return to the newsroom</Link></Button>}</main></div>;
}

export default function ArticleDetailPage() {
  const [, params] = useRoute("/articles/:slug");
  const article = trpc.news.bySlug.useQuery({ slug: params?.slug ?? "not-found" });
  if (article.isLoading) return <div className="min-h-screen bg-[#fffdf9]"><ArticleHeader /><main className="article-shell py-16"><Skeleton className="h-4 w-28" /><Skeleton className="mt-8 h-24 w-full" /><Skeleton className="mt-5 h-8 w-2/3" /><Skeleton className="mt-10 aspect-[1.7] w-full" /></main></div>;
  if (article.isError) return <ArticleMessage error retry={() => article.refetch()} />;
  if (!article.data) return <ArticleMessage />;
  const story = article.data;
  const mediaByPosition = new Map(story.media.map(image => [image.displayOrder, image] as const));
  const blocks = story.content.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  const imageMarker = /^\{\{image:(\d+)\}\}$/;
  return <div className="min-h-screen bg-[#fffdf9] text-stone-900"><ArticleHeader /><main><section className="article-shell pb-10 pt-12 sm:pb-14 sm:pt-20"><Link href="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-stone-500 transition-colors hover:text-stone-950"><ArrowLeft className="h-3.5 w-3.5" /> All stories</Link><div className="mt-12"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-amber-700">{story.category?.name ?? "News"}</p><h1 className="mt-5 font-display text-[clamp(3rem,7vw,5.65rem)] leading-[.9] tracking-[-.06em] text-stone-950">{story.title}</h1><p className="mt-8 max-w-2xl text-lg leading-8 text-stone-600 sm:text-xl">{story.summary}</p><div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-stone-500"><time>{formatDate(story.publishedAt)}</time>{story.tags.map(tag => <span className="rounded-full bg-stone-100 px-3 py-1 font-medium text-stone-600" key={tag.id}>{tag.name}</span>)}</div></div></section><article className="article-shell py-12 sm:py-16"><div className="article-body">{blocks.map((block, index) => { const match = imageMarker.exec(block); const image = match ? mediaByPosition.get(Number(match[1])) : undefined; return image ? <figure className="my-10" key={`image-${image.id}`}><img src={image.storageUrl} alt={image.altText || "Article image"} className="w-full rounded-sm" /></figure> : <p key={index}>{block}</p>; })}</div><div className="mt-14 border-t border-stone-200 pt-7"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-stone-400">Original source</p><a href={story.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 break-all text-sm font-semibold text-stone-800 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-amber-800">{story.sourceUrl}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a></div></article></main></div>;
}
