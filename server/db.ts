import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  articleMedia,
  articles,
  articleStatusValues,
  articleTags,
  categories,
  type InsertUser,
  tags,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 150) || "article";

async function uniqueArticleSlug(base: string, excludingId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const initial = slugify(base);
  let candidate = initial;
  let suffix = 2;
  while (true) {
    const matched = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, candidate)).limit(1);
    if (!matched[0] || matched[0].id === excludingId) return candidate;
    candidate = `${initial.slice(0, 145)}-${suffix++}`;
  }
}

async function findOrCreateCategory(name?: string | null) {
  if (!name?.trim()) return null;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const trimmedName = name.trim();
  const slug = slugify(trimmedName);
  await db.insert(categories).values({ name: trimmedName, slug }).onDuplicateKeyUpdate({ set: { name: trimmedName } });
  const category = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return category[0] ?? null;
}

async function replaceArticleTags(articleId: number, tagNames: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const cleanNames = Array.from(new Set(tagNames.map(name => name.trim()).filter(Boolean))).slice(0, 12);
  await db.delete(articleTags).where(eq(articleTags.articleId, articleId));
  if (!cleanNames.length) return;
  const tagIds: number[] = [];
  for (const name of cleanNames) {
    const slug = slugify(name);
    await db.insert(tags).values({ name, slug }).onDuplicateKeyUpdate({ set: { name } });
    const tag = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
    if (tag[0]) tagIds.push(tag[0].id);
  }
  if (tagIds.length) await db.insert(articleTags).values(tagIds.map(tagId => ({ articleId, tagId })));
}

async function mediaByArticleIds(articleIds: number[]) {
  if (!articleIds.length) return new Map<number, Array<typeof articleMedia.$inferSelect>>();
  const db = await getDb();
  if (!db) return new Map<number, Array<typeof articleMedia.$inferSelect>>();
  const rows = await db.select().from(articleMedia).where(inArray(articleMedia.articleId, articleIds)).orderBy(asc(articleMedia.displayOrder));
  return rows.reduce((map, media) => {
    const current = map.get(media.articleId) ?? [];
    current.push(media);
    map.set(media.articleId, current);
    return map;
  }, new Map<number, Array<typeof articleMedia.$inferSelect>>());
}

async function tagsByArticleId(articleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(eq(articleTags.articleId, articleId))
    .orderBy(asc(tags.name));
}

export async function listCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).orderBy(asc(categories.name));
}

export async function listPublicArticles(input: { page: number; pageSize: number; categorySlug?: string }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const page = Math.max(1, input.page);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 24);
  const where = input.categorySlug
    ? and(eq(articles.status, "published"), eq(categories.slug, input.categorySlug))
    : eq(articles.status, "published");
  const [rows, totalRows] = await Promise.all([
    db
      .select({ article: articles, category: categories })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(where)
      .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(articles).leftJoin(categories, eq(articles.categoryId, categories.id)).where(where),
  ]);
  const media = await mediaByArticleIds(rows.map(row => row.article.id));
  return {
    total: totalRows[0]?.total ?? 0,
    items: rows.map(row => ({ ...row.article, category: row.category, coverImage: media.get(row.article.id)?.[0] ?? null })),
  };
}

export async function getPublicArticleBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ article: articles, category: categories })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
    .limit(1);
  const row = result[0];
  if (!row) return null;
  const [media, articleTags] = await Promise.all([mediaByArticleIds([row.article.id]), tagsByArticleId(row.article.id)]);
  return { ...row.article, category: row.category, media: media.get(row.article.id) ?? [], tags: articleTags };
}

export async function listAdminArticles(status?: (typeof articleStatusValues)[number]) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ article: articles, category: categories })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(status ? eq(articles.status, status) : undefined)
    .orderBy(desc(articles.updatedAt));
  const media = await mediaByArticleIds(rows.map(row => row.article.id));
  return rows.map(row => ({ ...row.article, category: row.category, coverImage: media.get(row.article.id)?.[0] ?? null }));
}

export async function getAdminArticleById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ article: articles, category: categories })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(eq(articles.id, id))
    .limit(1);
  const row = result[0];
  if (!row) return null;
  const [media, currentTags] = await Promise.all([mediaByArticleIds([id]), tagsByArticleId(id)]);
  return { ...row.article, category: row.category, media: media.get(id) ?? [], tags: currentTags };
}

export type ArticleWriteInput = {
  title: string;
  summary: string;
  content: string;
  status: (typeof articleStatusValues)[number];
  sourceUrl: string;
  categoryName?: string | null;
  tagNames: string[];
};

export async function createArticle(input: ArticleWriteInput, authorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const category = await findOrCreateCategory(input.categoryName);
  const slug = await uniqueArticleSlug(input.title);
  const now = new Date();
  const result = await db.insert(articles).values({
    slug,
    title: input.title,
    summary: input.summary,
    content: input.content,
    status: input.status,
    sourceUrl: input.sourceUrl,
    categoryId: category?.id ?? null,
    authorId,
    publishedAt: input.status === "published" ? now : null,
  });
  const articleId = Number(result[0].insertId);
  await replaceArticleTags(articleId, input.tagNames);
  return getAdminArticleById(articleId);
}

export async function updateArticle(articleId: number, input: ArticleWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getAdminArticleById(articleId);
  if (!existing) return null;
  const category = await findOrCreateCategory(input.categoryName);
  const slug = await uniqueArticleSlug(input.title, articleId);
  await db
    .update(articles)
    .set({
      slug,
      title: input.title,
      summary: input.summary,
      content: input.content,
      status: input.status,
      sourceUrl: input.sourceUrl,
      categoryId: category?.id ?? null,
      publishedAt: input.status === "published" ? existing.publishedAt ?? new Date() : null,
    })
    .where(eq(articles.id, articleId));
  await replaceArticleTags(articleId, input.tagNames);
  return getAdminArticleById(articleId);
}

export async function deleteArticle(articleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(articleTags).where(eq(articleTags.articleId, articleId));
  await db.delete(articleMedia).where(eq(articleMedia.articleId, articleId));
  await db.delete(articles).where(eq(articles.id, articleId));
}

export async function addPersistedMedia(input: {
  articleId: number;
  sourceUrl: string;
  storageKey: string;
  storageUrl: string;
  altText?: string | null;
  displayOrder: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(articleMedia).values(input);
}

export async function updateArticleContent(articleId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(articles).set({ content }).where(eq(articles.id, articleId));
}
