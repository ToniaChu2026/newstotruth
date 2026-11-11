import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isValidSlug,
  loadPosts,
  parsePost,
  serializePost,
  titleSlug,
} from "./content";
import {
  addArticle,
  mediaPrefix,
  resolveContent,
  type FetchedSource,
} from "./importer/add";
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
  title: "测试文章：标题",
  summary: "摘要",
  category: "感悟",
  tags: ["标签"],
  contentRange: { start: "正文开始", end: "原文链接：" },
  captions: { "1": "图说：第一张图" },
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
      caption: "首图图说",
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
  it("原樣取出起訖之間的段落，刪掉指定段落與圖說段落", () => {
    const { content } = resolveContent(
      {
        contentRange: {
          start: "正文开始",
          end: "原文链接：",
          omit: ["第三段"],
        },
        captions: { "1": "图说：第一张图" },
      },
      source.text
    );
    expect(content).toBe(
      `正文开始。${filler}\n\n{{image:1}}\n\n第二段。${filler}\n\n{{image:2}}`
    );
  });

  it("找不到起點時報錯", () => {
    expect(() =>
      resolveContent({ contentRange: { start: "不存在" } }, source.text)
    ).toThrow(/start/);
  });
});

describe("文章網址", () => {
  it("由標題產生，保留中文，去掉標點", () => {
    expect(titleSlug("前NBA球星：“真善忍”将成为我的座右铭")).toBe(
      "前nba球星真善忍将成为我的座右铭"
    );
    expect(titleSlug("美国女子濒死时回顾一生 看尽自己此生善恶")).toBe(
      "美国女子濒死时回顾一生-看尽自己此生善恶"
    );
    expect(titleSlug("？！")).toBe("post");
  });

  it("拒絕會破壞網址或撞到網站頁面的檔名", () => {
    expect(isValidSlug("美国女子濒死时回顾一生-看尽自己此生善恶")).toBe(true);
    expect(isValidSlug("前nba球星：真善忍将成为我的座右铭")).toBe(true);
    for (const bad of ["a/b", "a b", "a%20b", "search", "Category", ".x", ""])
      expect(isValidSlug(bad)).toBe(false);
  });
});

const slug = "测试文章标题";
const prefix = mediaPrefix(source.sourceUrl, now, "/nonexistent");

describe("新增文章", () => {
  it("寫成文章檔：標題當網址，首圖與圖說保留，其餘圖片留在原位", async () => {
    const result = await addArticle(source, structured, { dir, download, now });
    expect(result.slug).toBe(slug);
    expect(result.imageCount).toBe(2);
    const [post] = loadPosts(dir);
    expect(post).toMatchObject({
      slug,
      title: "测试文章：标题",
      category: "感悟",
      image: `/media/${prefix}-1.jpg`,
      caption: "图说：第一张图",
      source: source.sourceUrl,
    });
    expect(post.blocks.filter(block => block.type === "img")).toEqual([
      { type: "img", url: `/media/${prefix}-2.jpg`, alt: "图2" },
    ]);
    expect(
      post.blocks.some(
        block => block.type === "p" && block.text.startsWith("图说")
      )
    ).toBe(false);
    expect(fs.readdirSync(path.join(dir, "media")).sort()).toEqual([
      `${prefix}-1.jpg`,
      `${prefix}-2.jpg`,
    ]);
  });

  it("同一來源不會加第二次；不同來源同標題時網址加上編號", async () => {
    await addArticle(source, structured, { dir, download, now });
    const again = await addArticle(source, structured, { dir, download, now });
    expect(again.duplicate).toBe(true);
    expect(loadPosts(dir)).toHaveLength(1);
    const other = await addArticle(
      { ...source, sourceUrl: "https://publisher.example.com/other" },
      structured,
      { dir, download, now }
    );
    expect(other.slug).toBe(`${slug}-2`);
  });

  it("內文圖片的圖說寫在圖片下方", async () => {
    await addArticle(
      source,
      {
        ...structured,
        captions: { "1": "图说：第一张图", "2": "第二张图的说明" },
      },
      { dir, download, now }
    );
    const [post] = loadPosts(dir);
    expect(post.blocks.find(block => block.type === "img")).toMatchObject({
      caption: "第二张图的说明",
    });
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
    expect(post.image).toBe(`/media/${prefix}-1.jpg`);
    expect(post.caption).toBeNull();
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
    const encoded = encodeURIComponent(slug);
    const home = read("index.html");
    expect(home).toContain("测试文章：标题");
    expect(home).not.toContain("草稿文章");
    expect(home).toContain(`href="/repo/${encoded}/"`);
    expect(home).toContain(`src="/repo/media/${prefix}-1.jpg"`);
    expect(home).toMatch(/href="\/repo\/assets\/site\.[0-9a-f]+\.css"/);
    const article = read(`${slug}/index.html`);
    expect(article).toContain("<title>测试文章：标题 | 新闻聚焦</title>");
    expect(article).toContain("<figcaption");
    expect(article).toContain("图说：第一张图");
    expect(article).toContain(
      `property="og:image" content="https://user.github.io/repo/media/${prefix}-1.jpg"`
    );
    expect(read("category/inspired/index.html")).toContain("测试文章：标题");
    expect(read("category/focus/index.html")).toContain("暂无文章");
    expect(fs.existsSync(path.join(outDir, "草稿文章"))).toBe(false);
    const index = JSON.parse(read("search-index.json"));
    expect(index).toHaveLength(1);
    expect(index[0].path).toBe(`/${encoded}/`);
    expect(read("sitemap.xml")).toContain(
      `https://user.github.io/repo/${encoded}/`
    );
    expect(fs.existsSync(path.join(outDir, `media/${prefix}-1.jpg`))).toBe(
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

describe("搬移 WordPress 文章", () => {
  it("拆出段落、小標題、圖片與圖說，取出原文連結", async () => {
    const { parseWpContent } = await import("./importer/wordpress");
    const html = `
<p class="wp-block-paragraph">【大纪元讯】第一段&amp;内容。</p>
<p class="wp-block-paragraph"><strong>小标题</strong></p>
<div class="wp-block-image"><figure class="aligncenter"><img src="https://a.example/1.jpg" alt="" /></figure></div>
<p class="has-text-align-center wp-block-paragraph">置中的图说。（提供）</p>
<div class="wp-block-image"><figure><img src="https://a.example/2.jpg" alt="说明" /></figure></div>
<p class="wp-block-paragraph"><em>斜体图说</em></p>
<figure><img src="https://a.example/3.jpg" alt="" /><figcaption>内建图说</figcaption></figure>
<p class="wp-block-paragraph">第二段，<strong>部分粗体</strong>仍是段落。</p>
<p class="wp-block-paragraph">原文链接：https://source.example/x</p>`;
    const { blocks, source } = parseWpContent(html);
    expect(source).toBe("https://source.example/x");
    expect(blocks).toEqual([
      { type: "p", text: "【大纪元讯】第一段&内容。" },
      { type: "h", text: "小标题" },
      {
        type: "img",
        url: "https://a.example/1.jpg",
        alt: "",
        caption: "置中的图说。（提供）",
      },
      {
        type: "img",
        url: "https://a.example/2.jpg",
        alt: "说明",
        caption: "斜体图说",
      },
      {
        type: "img",
        url: "https://a.example/3.jpg",
        alt: "",
        caption: "内建图说",
      },
      { type: "p", text: "第二段，部分粗体仍是段落。" },
    ]);
  });
});
