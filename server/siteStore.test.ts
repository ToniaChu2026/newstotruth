import { blocksToEditable, editableToBlocks } from "@shared/siteContent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importToWordPress } from "./articleImport";
import { SiteStore } from "./siteStore";
import { localSiteTarget } from "./target";

let dir: string;
let store: SiteStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntt-site-"));
  store = new SiteStore(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const html = `<html><head><title>測試文章</title></head><body><article>
<p>${"第一段文字，內容足夠長可以通過最短長度的檢查。".repeat(4)}</p>
<img src="https://publisher.example.com/a.jpg" alt="首圖" width="800" height="500">
<p>${"第二段文字，同樣需要一些長度才行。".repeat(4)}</p>
<img src="https://publisher.example.com/b.jpg" alt="內文圖" width="800" height="500">
<p>第三段。</p></article></body></html>`;

function runImport(url = "https://publisher.example.com/story") {
  return importToWordPress(url, {
    wp: localSiteTarget(store),
    validateUrl: async value => value,
    fetchPage: async value => ({ html, finalUrl: value }),
    download: async () => ({
      bytes: Buffer.alloc(9000, 1),
      contentType: "image/jpeg",
      extension: "jpg",
    }),
    structure: async ({ sourceText }) => ({
      title: "测试文章",
      summary: "摘要",
      content: sourceText,
      category: "述评",
      tags: ["标签一", "标签二"],
    }),
  });
}

describe("匯入到本站", () => {
  it("建立草稿、存下圖片，首圖不重複放進內文", async () => {
    const result = await runImport();
    expect(result.editUrl).toBe(`/admin/edit/${result.postId}`);
    expect(result.imageCount).toBe(2);
    const post = store.get(result.postId)!;
    expect(post.status).toBe("draft");
    expect(post.category).toBe("述评");
    expect(post.tags).toEqual(["标签一", "标签二"]);
    expect(post.image).toMatch(/^\/media\/import-.*\.jpg$/);
    const images = post.blocks.filter(block => block.type === "img");
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ alt: "內文圖" });
    expect(images[0].type === "img" && images[0].url).not.toBe(post.image);
    expect(fs.existsSync(path.join(dir, post.image!))).toBe(true);
    // 草稿不出現在公開列表
    expect(store.list({ status: "published" }).total).toBe(0);
  });

  it("同一來源網址不會建立第二篇", async () => {
    const first = await runImport();
    const second = await runImport();
    expect(second.duplicate).toBe(true);
    expect(second.postId).toBe(first.postId);
    expect(store.list().total).toBe(1);
  });
});

describe("文章庫", () => {
  const base = {
    excerpt: "",
    blocks: [{ type: "p" as const, text: "内文关键词" }],
    tags: [],
    image: null,
    sourceUrl: null,
  };

  it("發佈、分類篩選、搜尋與重新載入", () => {
    const a = store.create({ ...base, title: "甲", category: "聚焦" });
    const b = store.create({ ...base, title: "乙", category: "历史" });
    store.setStatus(a.id, "published");
    store.setStatus(b.id, "published");
    expect(store.list({ status: "published", category: "历史" }).total).toBe(1);
    expect(store.list({ status: "published", query: "关键词" }).total).toBe(2);
    expect(store.list({ status: "published", query: "乙" }).items[0].id).toBe(
      b.id
    );
    const reloaded = new SiteStore(dir);
    expect(reloaded.list({ status: "published" }).total).toBe(2);
    expect(reloaded.create({ ...base, title: "丙", category: "最新" }).id).toBe(
      3
    );
  });

  it("撤回後重新發佈保留原本的發佈時間", () => {
    const post = store.create({ ...base, title: "甲", category: "聚焦" });
    const first = store.setStatus(post.id, "published")!.publishedAt;
    store.setStatus(post.id, "draft");
    expect(store.setStatus(post.id, "published")!.publishedAt).toBe(first);
  });

  it("刪除文章時一併刪除不再使用的圖片", () => {
    const media = store.saveMedia(Buffer.from("x"), "a.jpg");
    const post = store.create({ ...base, title: "甲", category: "聚焦", image: media.url });
    expect(store.remove(post.id)).toBe(true);
    expect(fs.existsSync(path.join(dir, "media", "a.jpg"))).toBe(false);
  });
});

describe("後台編輯格式", () => {
  it("區塊與純文字可以來回轉換", () => {
    const blocks = [
      { type: "p" as const, text: "第一段" },
      { type: "img" as const, url: "/media/a.jpg", alt: "说明", caption: "图说" },
      { type: "p" as const, text: "第二段" },
    ];
    expect(editableToBlocks(blocksToEditable(blocks))).toEqual(blocks);
  });

  it("不安全的圖片網址當成一般文字", () => {
    expect(editableToBlocks("![x](javascript:alert(1))")[0].type).toBe("p");
    expect(editableToBlocks("![x](http://a.example/a.jpg)")[0].type).toBe("p");
  });
});
