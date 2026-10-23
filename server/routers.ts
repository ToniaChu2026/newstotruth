import { COOKIE_NAME, WP_CATEGORIES } from "@shared/const";
import { z } from "zod";
import { passwordMatches, signSession } from "./_core/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getJob, listJobs, startImportJob } from "./importJobs";
import { wordpressClient } from "./wordpress";

export const importUrlSchema = z.string().trim().url().max(2048);

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
  importer: router({
    settings: adminProcedure.query(() => ({
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
    checkConnection: adminProcedure.mutation(async () => {
      const wp = wordpressClient();
      const userId = await wp.me();
      const categories = await wp.listCategories();
      return { userId, categories };
    }),
  }),
});

export type AppRouter = typeof appRouter;
