import { siteCategoryBySlug } from "@shared/const";
import { ENV } from "./_core/env";
import { siteStore } from "./siteStore";
import { escapeAttribute, escapeHtml } from "./wpContent";

type Meta = { title: string; description: string; image?: string | null };

function metaFor(pathname: string): Meta {
  const site = ENV.siteName;
  const fallback: Meta = { title: site, description: ENV.siteTagline };
  const post = /^\/post\/(\d+)\/?$/.exec(pathname);
  if (post) {
    const found = siteStore().get(Number(post[1]));
    if (found?.status === "published")
      return {
        title: `${found.title} | ${site}`,
        description: found.excerpt,
        image: found.image,
      };
    return fallback;
  }
  const category = /^\/category\/([\w-]+)\/?$/.exec(pathname);
  const found = category ? siteCategoryBySlug(category[1]) : null;
  if (found) return { ...fallback, title: `${found.name} | ${site}` };
  if (pathname.startsWith("/admin"))
    return { title: `${site} 后台`, description: "" };
  return fallback;
}

/**
 * 網站是單頁應用，這裡在伺服器端先把標題、描述與分享圖寫進 HTML，
 * 讓搜尋引擎與社群平台的連結預覽拿得到正確資訊。
 */
export function injectPageMeta(html: string, pathname: string) {
  const meta = metaFor(pathname);
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(meta.description)}" />`,
    `<meta property="og:title" content="${escapeAttribute(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(meta.description)}" />`,
    `<meta property="og:site_name" content="${escapeAttribute(ENV.siteName)}" />`,
    meta.image
      ? `<meta property="og:image" content="${escapeAttribute(meta.image)}" />`
      : "",
    pathname.startsWith("/admin")
      ? `<meta name="robots" content="noindex" />`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");
  return html.replace(/<title>[\s\S]*?<\/title>/, () => tags);
}
