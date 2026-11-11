import {
  COOKIE_NAME,
  SITE_CATEGORIES,
  SITE_PAGE_SIZE,
  WP_CATEGORIES,
  WP_CATEGORY_NAMES,
  siteCategoryBySlug,
} from "@shared/const";
import {
  blocksToEditable,
  editableToBlocks,
  isSafeImageUrl,
} from "@shared/siteContent";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { passwordMatches, signSession } from "./_core/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getJob, listJobs, startImportJob } from "./importJobs";
import { siteStore } from "./siteStore";
import { localSiteTarget } from "./target";
import { wordpressClient } from "./wordpress";

export const importUrlSchema = z.string().trim().url().max(2048);

const postId = z.object({ id: z.number().int().positive() });
function notFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "找不到这篇文章。" });
}

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    login: publicProcedure
      .input(z.object({ password: z.string().min(1).max(200) }))
      .mutation(async ({ input, ctx }) => {
        if (!passwordMatches(input.password)) throw new Error("密碼不正確。");
        const token = await signSession();
        ctx.res.cookie(COOKIE_NAME, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: 1000 * 60 * 60 * 24 * 30,
        });
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),
  site: router({
    info: publicProcedure.query(() => ({
      name: ENV.siteName,
      tagline: ENV.siteTagline,
      categories: SITE_CATEGORIES,
    })),
    list: publicProcedure
      .input(
        z.object({
          category: z.string().max(40).optional(),
          query: z.string().trim().max(80).optional(),
          page: z.number().int().min(1).max(10_000).default(1),
        })
      )
      .query(({ input }) => {
        const category = input.category
          ? siteCategoryBySlug(input.category)
          : null;
        if (input.category && !category) notFound();
        return siteStore().list({
          status: "published",
          category: category?.name,
          query: input.query || undefined,
          page: input.page,
          perPage: SITE_PAGE_SIZE,
        });
      }),
    recent: publicProcedure.query(
      () => siteStore().list({ status: "published", perPage: 5 }).items
    ),
    post: publicProcedure.input(postId).query(({ input, ctx }) => {
      const post = siteStore().get(input.id);
      // 草稿只有登入的管理員看得到（用來預覽）。
      if (!post || (post.status !== "published" && !ctx.user)) notFound();
      const related = siteStore()
        .list({ status: "published", category: post.category, perPage: 4 })
        .items.filter(item => item.id !== post.id)
        .slice(0, 3);
      return { post, related };
    }),
  }),
  importer: router({
    settings: adminProcedure.query(() => ({
      target: ENV.importTarget,
      siteName: ENV.siteName,
      wpBaseUrl: ENV.wpBaseUrl,
      model: ENV.anthropicModel,
      categories: WP_CATEGORIES,
    })),
    start: adminProcedure
      .input(z.object({ url: importUrlSchema }))
      .mutation(({ input }) => startImportJob(input.url)),
    job: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(({ input }) => {
        const job = getJob(input.id);
        if (!job) throw new Error("找不到這個匯入工作。");
        return job;
      }),
    jobs: adminProcedure.query(() => listJobs()),
    recentPosts: adminProcedure.query(async () => {
      if (ENV.importTarget === "site") {
        const target = localSiteTarget();
        return siteStore()
          .list({ perPage: 100 })
          .items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(post => ({
            id: post.id,
            title: post.title,
            status: post.status === "published" ? "publish" : "draft",
            modified: post.updatedAt,
            editUrl: target.editUrl(post.id),
            previewUrl: target.previewUrl({ id: post.id, link: "" }),
            categories: [post.category],
            sourceUrl: post.sourceUrl,
          }));
      }
      const wp = wordpressClient();
      const posts = await wp.listRecentPosts(20);
      return posts.map(post => ({
        id: post.id,
        title: post.title.rendered,
        status: post.status,
        modified: post.modified,
        editUrl: wp.editUrl(post.id),
        previewUrl: wp.previewUrl(post),
        categories: post.categories.map(
          id =>
            WP_CATEGORIES.find(category => category.id === id)?.name ??
            String(id)
        ),
        sourceUrl:
          typeof post.meta?.source_url === "string"
            ? post.meta.source_url
            : null,
      }));
    }),
    post: adminProcedure.input(postId).query(({ input }) => {
      const post = siteStore().get(input.id) ?? notFound();
      const { blocks, ...rest } = post;
      return { ...rest, body: blocksToEditable(blocks) };
    }),
    updatePost: adminProcedure
      .input(
        postId.extend({
          title: z.string().trim().min(1).max(320),
          excerpt: z.string().trim().max(2000),
          category: z.enum(WP_CATEGORY_NAMES),
          tags: z.array(z.string().trim().min(1).max(40)).max(12),
          body: z.string().max(450_000),
          image: z
            .string()
            .trim()
            .max(2048)
            .refine(value => !value || isSafeImageUrl(value), {
              message: "首圖網址必須是 /media/… 或 https:// 開頭。",
            }),
        })
      )
      .mutation(({ input }) => {
        const { id, body, image, ...fields } = input;
        const post =
          siteStore().update(id, {
            ...fields,
            image: image || null,
            blocks: editableToBlocks(body),
          }) ?? notFound();
        return { id: post.id };
      }),
    setStatus: adminProcedure
      .input(postId.extend({ status: z.enum(["draft", "published"]) }))
      .mutation(({ input }) => {
        const post =
          siteStore().setStatus(input.id, input.status) ?? notFound();
        return { id: post.id, status: post.status };
      }),
    deletePost: adminProcedure.input(postId).mutation(({ input }) => {
      if (!siteStore().remove(input.id)) notFound();
      return { success: true } as const;
    }),
    checkConnection: adminProcedure.mutation(async () => {
      const wp = wordpressClient();
      const userId = await wp.me();
      const categories = await wp.listCategories();
      return { userId, categories };
    }),
  }),
});

export type AppRouter = typeof appRouter;
