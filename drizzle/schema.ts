import { int, longtext, mediumtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const articleStatusValues = ["draft", "pending review", "published"] as const;

export const categories = mysqlTable(
  "categories",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 96 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("categories_slug_unique").on(table.slug)],
);

export const tags = mysqlTable(
  "tags",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 96 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("tags_slug_unique").on(table.slug)],
);

export const articles = mysqlTable(
  "articles",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 320 }).notNull(),
    summary: mediumtext("summary").notNull(),
    content: longtext("content").notNull(),
    status: mysqlEnum("status", articleStatusValues).default("draft").notNull(),
    sourceUrl: varchar("sourceUrl", { length: 2048 }).notNull(),
    categoryId: int("categoryId"),
    authorId: int("authorId").notNull(),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("articles_slug_unique").on(table.slug)],
);

/** Every imported image is copied to S3; source URLs are retained only for traceability. */
export const articleMedia = mysqlTable("articleMedia", {
  id: int("id").autoincrement().primaryKey(),
  articleId: int("articleId").notNull(),
  sourceUrl: varchar("sourceUrl", { length: 2048 }).notNull(),
  storageKey: varchar("storageKey", { length: 1024 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 2048 }).notNull(),
  altText: varchar("altText", { length: 320 }),
  displayOrder: int("displayOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const articleTags = mysqlTable(
  "articleTags",
  {
    id: int("id").autoincrement().primaryKey(),
    articleId: int("articleId").notNull(),
    tagId: int("tagId").notNull(),
  },
  table => [uniqueIndex("article_tag_unique").on(table.articleId, table.tagId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type ArticleMedia = typeof articleMedia.$inferSelect;
