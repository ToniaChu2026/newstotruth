import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { articleStatusValues } from "../drizzle/schema";
import { importAuthorizedArticle } from "./articleImport";
import * as newsDb from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

export const articleStatusSchema = z.enum(articleStatusValues);
export const articleWriteSchema = z.object({
  title: z.string().trim().min(3).max(320),
  summary: z.string().trim().min(12).max(10000),
  content: z.string().trim().min(24).max(500000),
  status: articleStatusSchema,
  sourceUrl: z.string().trim().url().max(2048),
  categoryName: z.string().trim().max(80).nullable().optional(),
  tagNames: z.array(z.string().trim().min(1).max(80)).max(12),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  news: router({
    categories: publicProcedure.query(() => newsDb.listCategories()),
    list: publicProcedure
      .input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(24).default(9), categorySlug: z.string().trim().min(1).max(96).optional() }))
      .query(({ input }) => newsDb.listPublicArticles(input)),
    bySlug: publicProcedure.input(z.object({ slug: z.string().trim().min(1).max(160) })).query(({ input }) => newsDb.getPublicArticleBySlug(input.slug)),
  }),
  admin: router({
    listArticles: adminProcedure.input(z.object({ status: articleStatusSchema.optional() })).query(({ input }) => newsDb.listAdminArticles(input.status)),
    articleById: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => newsDb.getAdminArticleById(input.id)),
    createArticle: adminProcedure.input(articleWriteSchema).mutation(({ input, ctx }) => newsDb.createArticle(input, ctx.user.id)),
    updateArticle: adminProcedure
      .input(z.object({ id: z.number().int().positive(), article: articleWriteSchema }))
      .mutation(async ({ input }) => {
        const article = await newsDb.updateArticle(input.id, input.article);
        if (!article) throw new Error("Article not found");
        return article;
      }),
    deleteArticle: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await newsDb.deleteArticle(input.id);
      return { success: true } as const;
    }),
    importArticle: adminProcedure.input(z.object({ url: z.string().trim().url().max(2048) })).mutation(async ({ input, ctx }) => {
      const article = await importAuthorizedArticle({ url: input.url, authorId: ctx.user.id });
      if (!article) throw new Error("The imported draft could not be loaded.");
      return article;
    }),
  }),
});

export type AppRouter = typeof appRouter;
