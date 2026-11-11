import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPosts, nextSlug, parsePost, serializePost } from "./content";
import { addArticle, resolveContent, type FetchedSource } from "./importer/add";
import { buildSite } from "./site/build";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntt-content-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const filler = "这一段文字只是为了让正文够长，可以通过最短长度的检查。";
const source: FetchedSource = {
  sourceUrl: "https://publisher.example.com/story",
  finalUrl: "https://publisher.example.com/story",
  pageTitle: "网页标题",
  text: `导航 首页\n\n{{image:0}}\n\n正文开始。${filler}\n\n{{image:1}}\n\n图说：第一张图\n\n第二段。${filler}\n\n{{image:2}}\n\n第三段。\n\n原文链接：x\n\n页脚`,
  images: [0, 1, 2].map(index => ({
    index,
    url: `https://publisher.example.com/${index}.jpg`,
    altText: `图${index}`,
  })),
};
const download = async () => ({
  bytes: Buffer.alloc(9000, 1),
  contentType: "image/jpeg",
  extension: "jpg",
});
const now = new Date("2026-11-10T20:00:00Z"); // 上海時間 11 日凌晨 4 點

const structured = {
  title: "测试文章",
  summary: "摘要",
  category: "感悟",
  tags: ["标签"],
  contentRange: { start: "正文开始", end: "原文链接：", omit: ["图说："] },
};

describe("文章檔格式", () => {
  it("寫出再讀回來內容不變", () => {
    const post = {
      title: "标题：带冒号",
      date: "2026-11-10T12:00:00.000Z",
      category: "述评",
      tags: ["甲", "乙"],
      excerpt: "摘要",
      image: "/media/a.jpg",
      source: "https://a.example/x",
      draft: false,
      blocks: [
        { type: "p" as const, text: "第一段" },
        {
          type: "img" as const,
          url: "/media/b.jpg",
          alt: "说明",
          caption: "图说",
        },
        { type: "p" as const, text: "第二段" },
      ],
    };
    expect(parsePost("s", serializePost(post))).toEqual({ slug: "s", ...post });
  });

  it("欄位缺漏時給出明確錯誤，未知分類退回「最新」", () => {
    expect(() => parsePost("s", "沒有欄位")).toThrow(/---/);
    expect(() => parsePost("s", "---\ndate: 2026-01-01\n---\n")).toThrow(
      /title/
    );
    expect(() => parsePost("s", "---\ntitle: t\ndate: 亂寫\n---\n")).toThrow(
      /date/
    );
    expect(
      parsePost(
        "s",
        "---\ntitle: t\ndate: 2026-01-01\ncategory: 科技\n---\n內文"
      ).category
    ).toBe("最新");
  });
});

describe("擷取正文範圍", () => {
  it("原樣取出起訖之間的段落並刪掉指定段落", () => {
    const { content } = resolveContent(
      {
        contentRange: {
          start: "正文开始",
          end: "原文链接：",
          omit: ["图说："],
        },
      },
      source.text
    );
    expect(content).toBe(
      `正文开始。${filler}\n\n{{image:1}}\n\n第二段。${filler}\n\n{{image:2}}\n\n第三段。`
    );
  });

  it("找不到起點時報錯", () => {
    expect(() =>
      resolveContent({ contentRange: { start: "不存在" } }, source.text)
    ).toThrow(/start/);
  });
});

describe("新增文章", () => {
  it("寫成文章檔：第一張圖當首圖，其餘留在原位，裝飾圖不下載", async () => {
    const result = await addArticle(source, structured, { dir, download, now });
    expect(result.slug).toBe("2026-11-11-01");
    expect(result.imageCount).toBe(2);
    const [post] = loadPosts(dir);
    expect(post).toMatchObject({
      title: "测试文章",
      category: "感悟",
      image: "/media/2026-11-11-01-1.jpg",
      source: source.sourceUrl,
    });
    expect(post.blocks.filter(block => block.type === "img")).toEqual([
      { type: "img", url: "/media/2026-11-11-01-2.jpg", alt: "图2" },
    ]);
    expect(fs.readdirSync(path.join(dir, "media")).sort()).toEqual([
      "2026-11-11-01-1.jpg",
      "2026-11-11-01-2.jpg",
    ]);
  });

  it("同一來源不會加第二次，新文章的檔名往後編號", async () => {
    await addArticle(source, structured, { dir, download, now });
    const again = await addArticle(source, structured, { dir, download, now });
    expect(again.duplicate).toBe(true);
    expect(loadPosts(dir)).toHaveLength(1);
    expect(nextSlug(now, dir)).toBe("2026-11-11-02");
  });

  it("圖片下載失敗時略過該張", async () => {
    let calls = 0;
    const result = await addArticle(source, structured, {
      dir,
      now,
      download: async () => {
        calls += 1;
        if (calls === 1) throw new Error("boom");
        return download();
      },
    });
    expect(result).toMatchObject({ imageCount: 1, skippedImages: 1 });
    const [post] = loadPosts(dir);
    expect(post.image).toBe("/media/2026-11-11-01-1.jpg");
    expect(post.blocks.every(block => block.type === "p")).toBe(true);
  });
});

describe("產生網站", () => {
  it("產生首頁、分類頁、文章頁與搜尋索引，草稿不上線，連結帶上子路徑", async () => {
    await addArticle(source, { ...structured }, { dir, download, now });
    await addArticle(
      { ...source, sourceUrl: "https://publisher.example.com/draft" },
      { ...structured, title: "草稿文章" },
      { dir, download, now, draft: true }
    );
    const outDir = path.join(dir, "dist");
    const result = await buildSite({
      contentDir: dir,
      outDir,
      basePath: "/repo/",
      siteUrl: "https://user.github.io/repo",
    });
    expect(result.posts).toBe(1);
    const read = (file: string) =>
      fs.readFileSync(path.join(outDir, file), "utf8");
    const home = read("index.html");
    expect(home).toContain("测试文章");
    expect(home).not.toContain("草稿文章");
    expect(home).toContain('href="/repo/post/2026-11-11-01/"');
    expect(home).toContain('src="/repo/media/2026-11-11-01-1.jpg"');
    expect(home).toMatch(/href="\/repo\/assets\/site\.[0-9a-f]+\.css"/);
    const article = read("post/2026-11-11-01/index.html");
    expect(article).toContain("<title>测试文章 | 新闻聚焦</title>");
    expect(article).toContain(
      'property="og:image" content="https://user.github.io/repo/media/2026-11-11-01-1.jpg"'
    );
    expect(read("category/inspired/index.html")).toContain("测试文章");
    expect(read("category/focus/index.html")).toContain("暂无文章");
    expect(fs.existsSync(path.join(outDir, "post/2026-11-11-02"))).toBe(false);
    expect(JSON.parse(read("search-index.json"))).toHaveLength(1);
    expect(read("sitemap.xml")).toContain(
      "https://user.github.io/repo/post/2026-11-11-01/"
    );
    expect(fs.existsSync(path.join(outDir, "media/2026-11-11-01-1.jpg"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outDir, "404.html"))).toBe(true);
  }, 30_000);

  it("設定標誌與橫幅時顯示在頁首與首頁最上方", async () => {
    fs.writeFileSync(
      path.join(dir, "site.json"),
      JSON.stringify({
        name: "站名",
        logo: "/media/site-logo.png",
        hero: {
          image: "/media/site-hero.png",
          alt: "横幅",
          link: "https://a.example/x",
        },
      })
    );
    await addArticle(source, structured, { dir, download, now });
    const outDir = path.join(dir, "dist");
    await buildSite({ contentDir: dir, outDir, basePath: "/repo" });
    const home = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
    expect(home).toContain('<img src="/repo/media/site-logo.png" alt="站名"');
    expect(home).toMatch(
      /<a href="https:\/\/a\.example\/x"[^>]*><img src="\/repo\/media\/site-hero\.png" alt="横幅"/
    );
    expect(home).not.toContain("头条");
    const category = fs.readFileSync(
      path.join(outDir, "category/inspired/index.html"),
      "utf8"
    );
    expect(category).toContain("site-logo.png");
    expect(category).not.toContain("site-hero.png");
  }, 30_000);
});
