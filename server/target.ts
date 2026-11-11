import { blocksFromMarkedText } from "@shared/siteContent";
import { ENV } from "./_core/env";
import { siteStore, type SiteStore } from "./siteStore";
import {
  wordpressClient,
  type CreateDraftInput,
  type WpMedia,
} from "./wordpress";

/** 匯入流程需要的發佈目的地介面；WordPress 與本站各有一份實作。 */
export type PublishTarget = {
  findPostBySourceUrl(
    sourceUrl: string
  ): Promise<{ id: number; link: string; title?: { rendered: string } } | null>;
  editUrl(postId: number): string;
  previewUrl(post: { id: number; link: string }): string;
  uploadMedia(input: {
    bytes: Buffer;
    filename: string;
    contentType: string;
    altText?: string;
    caption?: string;
  }): Promise<WpMedia>;
  ensureTags(names: string[]): Promise<number[]>;
  createDraft(input: CreateDraftInput): Promise<{ id: number; link: string }>;
};

/** 把文章存進本站文章庫（草稿），由後台審核後發佈。 */
export function localSiteTarget(store: SiteStore = siteStore()): PublishTarget {
  const link = (id: number) => `/post/${id}`;
  return {
    async findPostBySourceUrl(sourceUrl) {
      const post = store.findBySourceUrl(sourceUrl);
      return post
        ? { id: post.id, link: link(post.id), title: { rendered: post.title } }
        : null;
    },
    editUrl: id => `/admin/edit/${id}`,
    previewUrl: post => link(post.id),
    async uploadMedia(input) {
      const saved = store.saveMedia(input.bytes, input.filename);
      return { id: saved.id, source_url: saved.url };
    },
    // 本站直接存標籤名稱，不需要先換成 ID。
    async ensureTags() {
      return [];
    },
    async createDraft(input) {
      const plain = input.plain;
      if (!plain) throw new Error("本站匯入缺少純文字內容。");
      const images = new Map(plain.images.map(image => [image.index, image]));
      const post = store.create({
        title: input.title,
        excerpt: input.excerpt,
        blocks: blocksFromMarkedText(plain.text, images, plain.featuredIndex),
        category: plain.categoryName,
        tags: plain.tagNames,
        image:
          plain.featuredIndex === null
            ? null
            : (images.get(plain.featuredIndex)?.url ?? null),
        sourceUrl: input.sourceUrl,
      });
      return { id: post.id, link: link(post.id) };
    },
  };
}

export function defaultTarget(): PublishTarget {
  return ENV.importTarget === "wordpress"
    ? wordpressClient()
    : localSiteTarget();
}
