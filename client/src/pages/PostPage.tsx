import SiteLayout, {
  categoryHref,
  formatDate,
} from "@/components/site/SiteLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useEffect } from "react";
import { Link, useParams } from "wouter";

export default function PostPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const { user } = useAuth();
  const query = trpc.site.post.useQuery(
    { id },
    { enabled: valid, retry: false, refetchOnWindowFocus: false }
  );
  const info = trpc.site.info.useQuery(undefined, { staleTime: Infinity });
  const post = query.data?.post;

  useEffect(() => {
    if (post && info.data) document.title = `${post.title} | ${info.data.name}`;
  }, [post, info.data]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  return (
    <SiteLayout>
      {!valid || query.isError ? (
        <div className="px-5 py-28 text-center">
          <p className="font-display text-2xl text-stone-800">
            {query.error?.data?.code === "NOT_FOUND" || !valid
              ? "找不到这篇文章"
              : "文章加载失败"}
          </p>
          <Link
            href="/"
            className="mt-5 inline-block text-sm text-[var(--brand)] hover:underline"
          >
            返回首页
          </Link>
        </div>
      ) : !post ? (
        <div className="mx-auto max-w-[760px] px-5 py-12">
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="mt-8 aspect-[16/9] w-full rounded-none" />
          <Skeleton className="mt-8 h-40 w-full" />
        </div>
      ) : (
        <>
          {post.status === "draft" ? (
            <div className="flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-5 py-2.5 text-sm text-amber-900">
              草稿预览：这篇文章尚未发布，只有登录的管理员看得到。
              {user ? (
                <Link
                  href={`/admin/edit/${post.id}`}
                  className="font-medium underline"
                >
                  去编辑与发布
                </Link>
              ) : null}
            </div>
          ) : null}
          <article className="mx-auto max-w-[760px] px-5 pb-6 pt-10 sm:pt-14">
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-stone-400">
              <Link
                href={categoryHref(post.category)}
                className="font-medium text-[var(--brand)] hover:underline"
              >
                {post.category}
              </Link>
              <span aria-hidden>·</span>
              <time dateTime={post.publishedAt ?? post.updatedAt}>
                {formatDate(post.publishedAt ?? post.updatedAt)}
              </time>
              {user && post.status === "published" ? (
                <Link
                  href={`/admin/edit/${post.id}`}
                  className="ml-auto text-xs underline"
                >
                  编辑
                </Link>
              ) : null}
            </p>
            <h1 className="mt-4 font-display text-[30px] leading-[1.4] text-stone-900 sm:text-[40px]">
              {post.title}
            </h1>
            {post.image ? (
              <img
                src={post.image}
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
                    <img src={block.url} alt={block.alt} loading="lazy" />
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
                    <Link
                      href={`/search?q=${encodeURIComponent(tag)}`}
                      className="inline-block border border-stone-200 px-3 py-1 text-xs text-stone-500 hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    >
                      {tag}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {post.sourceUrl ? (
              <p className="mt-8 break-all border-t border-stone-200 pt-5 text-sm text-stone-400">
                原文链接：
                <a
                  href={post.sourceUrl}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="hover:text-[var(--brand)] hover:underline"
                >
                  {post.sourceUrl}
                </a>
              </p>
            ) : null}
          </article>
          {query.data?.related.length ? (
            <section className="mt-10 border-t border-stone-200 px-5 pt-10 sm:px-10">
              <h2 className="text-xs font-bold tracking-[.3em] text-[var(--brand)]">
                相关文章
              </h2>
              <ul className="mt-6 grid gap-8 sm:grid-cols-3">
                {query.data.related.map(item => (
                  <li key={item.id}>
                    <Link href={`/post/${item.id}`} className="group block">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          className="aspect-[16/10] w-full bg-stone-100 object-cover"
                        />
                      ) : null}
                      <p className="mt-3 text-[17px] leading-7 text-stone-800 group-hover:text-[var(--brand)]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        {formatDate(item.publishedAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </SiteLayout>
  );
}
