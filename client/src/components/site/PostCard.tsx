import type { SitePostSummary } from "@shared/types";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { categoryHref, formatDate } from "./SiteLayout";

export function PostMeta({ post }: { post: SitePostSummary }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-stone-400">
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
    </p>
  );
}

export default function PostCard({ post }: { post: SitePostSummary }) {
  const href = `/post/${post.id}`;
  return (
    <article className="group mb-10 break-inside-avoid">
      {post.image ? (
        <Link href={href} className="block overflow-hidden bg-stone-100">
          <img
            src={post.image}
            alt=""
            loading="lazy"
            className="w-full transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </Link>
      ) : (
        <div className="h-1 w-12 bg-[var(--brand)]" />
      )}
      <div className="pt-5">
        <PostMeta post={post} />
        <h2 className="mt-2 text-[23px] font-light leading-[1.4] text-stone-800">
          <Link href={href} className="hover:text-[var(--brand)]">
            {post.title}
          </Link>
        </h2>
        <p className="mt-3 line-clamp-5 text-[13.5px] leading-[1.9] text-stone-500">
          {post.excerpt}
        </p>
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1.5 border-t border-stone-200 pt-3 text-xs font-medium text-stone-500 hover:text-[var(--brand)]"
        >
          阅读全文 <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
