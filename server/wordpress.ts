import { ENV } from "./_core/env";

export type WpCategory = { id: number; name: string; slug: string };
export type WpTag = { id: number; name: string };
export type WpMedia = { id: number; source_url: string };
export type WpPostSummary = {
  id: number;
  link: string;
  status: string;
  date: string;
  modified: string;
  title: { rendered: string };
  categories: number[];
  featured_media: number;
  meta?: Record<string, unknown>;
};

export type WpClientOptions = {
  baseUrl: string;
  username: string;
  appPassword: string;
  fetchImpl?: typeof fetch;
};

export type CreateDraftInput = {
  title: string;
  content: string;
  excerpt: string;
  categoryIds: number[];
  tagIds: number[];
  featuredMediaId: number | null;
  sourceUrl: string;
};

export class WordPressError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "WordPressError";
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, entity: string) =>
      String.fromCodePoint(
        entity.startsWith("x")
          ? parseInt(entity.slice(1), 16)
          : parseInt(entity, 10)
      )
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** 以 Application Password 呼叫 WordPress REST API 的薄封裝。 */
export class WordPressClient {
  private readonly fetchImpl: typeof fetch;
  private meId: number | null = null;

  constructor(private readonly options: WpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get baseUrl() {
    return this.options.baseUrl.replace(/\/+$/, "");
  }

  editUrl(postId: number) {
    return `${this.baseUrl}/wp-admin/post.php?post=${postId}&action=edit`;
  }

  previewUrl(post: { id: number; link: string }) {
    const link = post.link || `${this.baseUrl}/?p=${post.id}`;
    return `${link}${link.includes("?") ? "&" : "?"}preview=true`;
  }

  private authHeader() {
    const token = Buffer.from(
      `${this.options.username}:${this.options.appPassword}`,
      "utf8"
    ).toString("base64");
    return `Basic ${token}`;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.authHeader());
    headers.set("Accept", "application/json");
    const response = await this.fetchImpl(
      `${this.baseUrl}/wp-json/wp/v2${path}`,
      {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(60_000),
      }
    );
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const error = body as { code?: string; message?: string } | null;
      throw new WordPressError(
        `WordPress 回應 ${response.status}：${error?.message || text.slice(0, 200) || response.statusText}`,
        response.status,
        error?.code
      );
    }
    return body as T;
  }

  private json<T>(path: string, method: "POST" | "PUT", payload: unknown) {
    return this.request<T>(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /** 確認帳號與密碼可用，並回傳目前使用者 ID。 */
  async me() {
    if (this.meId) return this.meId;
    const me = await this.request<{ id: number }>(
      "/users/me?context=edit&_fields=id"
    );
    this.meId = me.id;
    return me.id;
  }

  async listCategories() {
    const categories = await this.request<WpCategory[]>(
      "/categories?per_page=100&_fields=id,name,slug"
    );
    return categories.map(category => ({
      ...category,
      name: decodeEntities(category.name),
    }));
  }

  async ensureTags(names: string[]) {
    const ids: number[] = [];
    for (const rawName of names) {
      const name = rawName.trim();
      if (!name) continue;
      const matches = await this.request<WpTag[]>(
        `/tags?search=${encodeURIComponent(name)}&per_page=20&_fields=id,name`
      );
      const existing = matches.find(
        tag => decodeEntities(tag.name).toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      try {
        const created = await this.json<WpTag>("/tags", "POST", { name });
        ids.push(created.id);
      } catch (error) {
        // 同名標籤已存在但搜尋沒命中時，WordPress 會回 term_exists 並附上 ID。
        if (error instanceof WordPressError && error.code === "term_exists") {
          const again = await this.request<WpTag[]>(
            `/tags?search=${encodeURIComponent(name)}&per_page=20&_fields=id,name`
          );
          const found = again.find(
            tag => decodeEntities(tag.name).toLowerCase() === name.toLowerCase()
          );
          if (found) ids.push(found.id);
          continue;
        }
        throw error;
      }
    }
    return Array.from(new Set(ids));
  }

  async uploadMedia(input: {
    bytes: Buffer;
    filename: string;
    contentType: string;
    altText?: string;
    caption?: string;
  }) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(input.bytes)], { type: input.contentType }),
      input.filename
    );
    if (input.altText) form.append("alt_text", input.altText);
    if (input.caption) form.append("caption", input.caption);
    return this.request<WpMedia>("/media", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  }

  async createDraft(input: CreateDraftInput) {
    return this.json<WpPostSummary>("/posts", "POST", {
      status: "draft",
      title: input.title,
      content: input.content,
      excerpt: input.excerpt,
      categories: input.categoryIds,
      tags: input.tagIds,
      featured_media: input.featuredMediaId ?? 0,
      meta: { source_url: input.sourceUrl },
    });
  }

  /**
   * 查重：需要 mu-plugin 註冊 `source_url` meta 並支援 `?source_url=` 篩選。
   * 未安裝 mu-plugin 時 WordPress 會忽略該參數，所以這裡再比對一次 meta 以免誤判。
   */
  async findPostBySourceUrl(sourceUrl: string) {
    const posts = await this.request<WpPostSummary[]>(
      `/posts?status=any&per_page=10&source_url=${encodeURIComponent(sourceUrl)}&_fields=id,link,status,title,meta`
    );
    return (
      posts.find(post => post.meta && post.meta.source_url === sourceUrl) ??
      null
    );
  }

  /** 最近由匯入帳號建立或修改的文章。 */
  async listRecentPosts(limit = 20) {
    const author = await this.me();
    const posts = await this.request<WpPostSummary[]>(
      `/posts?status=any&author=${author}&per_page=${limit}&orderby=modified&order=desc&_fields=id,link,status,date,modified,title,categories,featured_media,meta`
    );
    return posts.map(post => ({
      ...post,
      title: { rendered: decodeEntities(post.title.rendered) },
    }));
  }
}

let singleton: WordPressClient | null = null;

export function wordpressClient() {
  if (!singleton) {
    if (!ENV.wpBaseUrl || !ENV.wpUsername || !ENV.wpAppPassword)
      throw new Error(
        "WordPress 連線尚未設定：請填寫 WP_BASE_URL、WP_USERNAME、WP_APP_PASSWORD。"
      );
    singleton = new WordPressClient({
      baseUrl: ENV.wpBaseUrl,
      username: ENV.wpUsername,
      appPassword: ENV.wpAppPassword,
    });
  }
  return singleton;
}
