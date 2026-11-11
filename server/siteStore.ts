import type {
  SiteBlock,
  SitePost,
  SitePostStatus,
  SitePostSummary,
} from "@shared/types";
import fs from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";

type StoreFile = { nextId: number; nextMediaId: number; posts: SitePost[] };

export type NewSitePost = {
  title: string;
  excerpt: string;
  blocks: SiteBlock[];
  category: string;
  tags: string[];
  image: string | null;
  sourceUrl: string | null;
  status?: SitePostStatus;
};

export type SitePostPatch = Partial<
  Pick<SitePost, "title" | "excerpt" | "blocks" | "category" | "tags" | "image">
>;

export type ListOptions = {
  status?: SitePostStatus;
  category?: string;
  query?: string;
  page?: number;
  perPage?: number;
};

const MEDIA_NAME = /^[\w.\-]+$/;

function summary(post: SitePost): SitePostSummary {
  const { blocks: _blocks, ...rest } = post;
  return rest;
}

function sortKey(post: SitePost) {
  return post.publishedAt ?? post.updatedAt;
}

/**
 * 獨立網站的文章庫：一個 JSON 檔加一個媒體資料夾，不需要資料庫。
 * 文章量在幾千篇以內時整檔讀寫就夠用。
 */
export class SiteStore {
  private data: StoreFile | null = null;
  private loadedMtime = 0;

  constructor(private readonly dir: string) {}

  get mediaDir() {
    return path.join(this.dir, "media");
  }

  private get file() {
    return path.join(this.dir, "posts.json");
  }

  private mtime() {
    return fs.statSync(this.file, { throwIfNoEntry: false })?.mtimeMs ?? 0;
  }

  /** 檔案被其他程序改過（例如示例資料腳本或還原備份）時重新讀取。 */
  private load(): StoreFile {
    const mtime = this.mtime();
    if (this.data && mtime === this.loadedMtime) return this.data;
    fs.mkdirSync(this.mediaDir, { recursive: true });
    this.data = mtime
      ? (JSON.parse(fs.readFileSync(this.file, "utf8")) as StoreFile)
      : { nextId: 1, nextMediaId: 1, posts: [] };
    this.loadedMtime = mtime;
    return this.data;
  }

  private save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data ?? this.load(), null, 2));
    fs.renameSync(tmp, this.file);
    this.loadedMtime = this.mtime();
  }

  list(options: ListOptions = {}) {
    const perPage = Math.max(1, Math.min(options.perPage ?? 12, 100));
    const query = options.query?.trim().toLowerCase();
    const all = this.load()
      .posts.filter(
        post =>
          (!options.status || post.status === options.status) &&
          (!options.category || post.category === options.category) &&
          (!query ||
            post.title.toLowerCase().includes(query) ||
            post.excerpt.toLowerCase().includes(query) ||
            post.tags.some(tag => tag.toLowerCase().includes(query)) ||
            post.blocks.some(
              block =>
                block.type === "p" && block.text.toLowerCase().includes(query)
            ))
      )
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id - a.id);
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    const page = Math.max(1, Math.min(options.page ?? 1, pages));
    return {
      items: all.slice((page - 1) * perPage, page * perPage).map(summary),
      total: all.length,
      page,
      pages,
    };
  }

  get(id: number) {
    return this.load().posts.find(post => post.id === id) ?? null;
  }

  findBySourceUrl(sourceUrl: string) {
    return (
      this.load().posts.find(post => post.sourceUrl === sourceUrl) ?? null
    );
  }

  create(input: NewSitePost) {
    const data = this.load();
    const now = new Date().toISOString();
    const status = input.status ?? "draft";
    const post: SitePost = {
      id: data.nextId++,
      title: input.title,
      excerpt: input.excerpt,
      blocks: input.blocks,
      category: input.category,
      tags: input.tags,
      image: input.image,
      sourceUrl: input.sourceUrl,
      status,
      createdAt: now,
      updatedAt: now,
      publishedAt: status === "published" ? now : null,
    };
    data.posts.push(post);
    this.save();
    return post;
  }

  update(id: number, patch: SitePostPatch) {
    const post = this.get(id);
    if (!post) return null;
    Object.assign(post, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return post;
  }

  setStatus(id: number, status: SitePostStatus) {
    const post = this.get(id);
    if (!post) return null;
    const now = new Date().toISOString();
    post.status = status;
    post.updatedAt = now;
    // 重新發佈時保留第一次的發佈時間，文章不會跳回首頁最上面。
    if (status === "published" && !post.publishedAt) post.publishedAt = now;
    this.save();
    return post;
  }

  remove(id: number) {
    const data = this.load();
    const post = this.get(id);
    if (!post) return false;
    data.posts = data.posts.filter(item => item.id !== id);
    this.save();
    const urls = [
      post.image,
      ...post.blocks.map(block => (block.type === "img" ? block.url : null)),
    ];
    for (const url of urls) {
      const name = url?.startsWith("/media/") ? url.slice(7) : null;
      if (!name || !MEDIA_NAME.test(name)) continue;
      const stillUsed = data.posts.some(
        other =>
          other.image === url ||
          other.blocks.some(block => block.type === "img" && block.url === url)
      );
      if (!stillUsed) fs.rmSync(path.join(this.mediaDir, name), { force: true });
    }
    return true;
  }

  saveMedia(bytes: Buffer, filename: string) {
    const data = this.load();
    const safe = filename.replace(/[^\w.\-]/g, "_");
    if (!MEDIA_NAME.test(safe)) throw new Error("圖片檔名不合法。");
    fs.writeFileSync(path.join(this.mediaDir, safe), bytes);
    const id = data.nextMediaId++;
    this.save();
    return { id, url: `/media/${safe}` };
  }
}

let singleton: SiteStore | null = null;

export function siteStore() {
  if (!singleton) singleton = new SiteStore(path.resolve(ENV.dataDir));
  return singleton;
}
