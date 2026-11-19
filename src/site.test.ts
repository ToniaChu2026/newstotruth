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
import { titleToPinyin, uniqueMediaPrefix } from "./importer/media-name";

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
const prefix = mediaPrefix(structured.title, now, "/nonexistent");

describe("圖片檔名", () => {
  it("用標題的拼音，多音字依詞語，撞名時加日期", () => {
    expect(prefix).toBe("ceshiwenzhang-biaoti");
    expect(titleToPinyin("三天遭42亿次网攻 退党中心：攻不破22年坚守")).toBe(
      "santianzao42yiciwanggong-tuidangzhongxin-gongbu"
    );
    expect(titleToPinyin("【特稿】重庆银行行长（上）")).toBe(
      "chongqingyinhanghangchang-shang"
    );
    const taken = new Set(["ceshi", "ceshi-20261111"]);
    expect(uniqueMediaPrefix("测试", "20261111", p => taken.has(p))).toBe(
      "ceshi-20261111-2"
    );
  });
});

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
    // 分類頁：標題列、麵包屑、側欄的搜尋與栏目（含篇數），和首頁不同。
    const category = read("category/inspired/index.html");
    expect(category).toContain('aria-label="位置"');
    expect(category).toContain("近期文章");
    expect(category).toMatch(/aria-current="page"[^>]*>感悟<span[^>]*>1<\/span>/);
    expect(category).toContain('action="/repo/search/"');
    expect(fs.existsSync(path.join(outDir, "草稿文章"))).toBe(false);
    const index = JSON.parse(read("search-index.json"));
    expect(index).toHaveLength(1);
    expect(index[0].path).toBe(`/${encoded}/`);
    // 正文另外放在 search-text.json，順序和索引相同。
    expect(index[0].text).toBeUndefined();
    const texts = JSON.parse(read("search-text.json"));
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("正文开始");
    expect(read("sitemap.xml")).toContain(
      `https://user.github.io/repo/${encoded}/`
    );
    expect(fs.existsSync(path.join(outDir, `media/${prefix}-1.jpg`))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outDir, "404.html"))).toBe(true);
  }, 30_000);

  it("首頁只保留設定的頁數，較舊的文章仍在分類頁", async () => {
    fs.writeFileSync(
      path.join(dir, "site.json"),
      JSON.stringify({ pageSize: 1, homePages: 1 })
    );
    await addArticle(source, { ...structured, title: "较旧的文章" }, {
      dir,
      download,
      now: new Date("2026-11-01T00:00:00Z"),
    });
    await addArticle(
      { ...source, sourceUrl: "https://publisher.example.com/new" },
      { ...structured, title: "最新的文章" },
      { dir, download, now }
    );
    const outDir = path.join(dir, "dist");
    await buildSite({ contentDir: dir, outDir, basePath: "/" });
    const read = (file: string) =>
      fs.readFileSync(path.join(outDir, file), "utf8");
    expect(read("index.html")).toContain("最新的文章");
    expect(fs.existsSync(path.join(outDir, "page/2/index.html"))).toBe(false);
    expect(read("category/inspired/page/2/index.html")).toContain("较旧的文章");
  }, 30_000);

  it("沒有首圖的文章不放首頁，但仍在分類頁與文章頁", async () => {
    await addArticle(source, { ...structured }, { dir, download, now });
    await addArticle(
      { ...source, sourceUrl: "https://publisher.example.com/plain", images: [] },
      { ...structured, title: "没有配图的文章" },
      { dir, download, now }
    );
    const outDir = path.join(dir, "dist");
    await buildSite({ contentDir: dir, outDir, basePath: "/" });
    const read = (file: string) =>
      fs.readFileSync(path.join(outDir, file), "utf8");
    const home = read("index.html");
    expect(home).toContain("测试文章：标题");
    expect(home).not.toContain("没有配图的文章");
    expect(read("category/inspired/index.html")).toContain("没有配图的文章");
    expect(fs.existsSync(path.join(outDir, "没有配图的文章/index.html"))).toBe(
      true
    );
  }, 30_000);

  it("設定標誌、橫幅與 GTM 時放到每一頁", async () => {
    fs.writeFileSync(
      path.join(dir, "site.json"),
      JSON.stringify({
        name: "站名",
        gtm: "GTM-TEST123",
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
    expect(home).toContain("'dataLayer','GTM-TEST123'");
    expect(home).toContain("ns.html?id=GTM-TEST123");
    const category = fs.readFileSync(
      path.join(outDir, "category/inspired/index.html"),
      "utf8"
    );
    expect(category).toContain("site-logo.png");
    expect(category).not.toContain("site-hero.png");
    expect(category).toContain("GTM-TEST123");
  }, 30_000);

  it("分享預覽與搜尋引擎標籤：og、twitter、結構化資料、分頁標題、sitemap 日期與 RSS", async () => {
    fs.writeFileSync(
      path.join(dir, "site.json"),
      JSON.stringify({
        pageSize: 1,
        logo: "/media/site-logo.png",
        hero: { image: "/media/site-hero.png" },
      })
    );
    await addArticle(source, structured, { dir, download, now });
    await addArticle(
      { ...source, sourceUrl: "https://publisher.example.com/plain", images: [] },
      { ...structured, title: "没有配图 <的> 文章" },
      { dir, download, now: new Date("2026-11-01T00:00:00Z") }
    );
    const outDir = path.join(dir, "dist");
    const origin = "https://user.github.io/repo";
    await buildSite({ contentDir: dir, outDir, basePath: "/repo", siteUrl: origin });
    const read = (file: string) =>
      fs.readFileSync(path.join(outDir, file), "utf8");
    const ld = (html: string) => {
      const found = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html);
      return found ? JSON.parse(found[1]) : null;
    };

    const article = read(`${slug}/index.html`);
    expect(article).toContain('property="og:type" content="article"');
    expect(article).toContain('name="twitter:card" content="summary_large_image"');
    expect(article).toContain('property="article:section" content="感悟"');
    expect(article).toMatch(/property="article:published_time" content="2026-11-10T/);
    expect(ld(article)).toMatchObject({
      "@type": "NewsArticle",
      headline: "测试文章：标题",
      articleSection: "感悟",
      image: [`${origin}/media/${prefix}-1.jpg`],
      mainEntityOfPage: `${origin}/${encodeURIComponent(slug)}/`,
      isBasedOn: "https://publisher.example.com/story",
    });

    // 沒有配圖的文章用網站標誌當分享圖，結構化資料裡的 < 不會破壞頁面。
    const plain = read("没有配图-的-文章/index.html");
    expect(plain).toContain(
      `property="og:image" content="${origin}/media/site-logo.png"`
    );
    expect(plain).toContain('name="twitter:card" content="summary"');
    expect(ld(plain).headline).toBe("没有配图 <的> 文章");
    expect(ld(plain).image).toBeUndefined();

    const home = read("index.html");
    expect(home).toContain('property="og:type" content="website"');
    // 橫幅版型的首頁沒有看得見的大標題，放一個只給搜尋引擎與讀屏軟體的 h1。
    expect(home.match(/<h1[ >]/g)).toHaveLength(1);
    expect(home).toContain('<h1 class="sr-only">新闻聚焦</h1>');
    expect(ld(home)).toMatchObject({ "@type": "WebSite", url: `${origin}/` });
    expect(home).toContain(
      `<link rel="alternate" type="application/rss+xml" title="新闻聚焦" href="${origin}/feed.xml"/>`
    );
    expect(read("category/inspired/index.html")).toContain(
      "<title>感悟 | 新闻聚焦</title>"
    );
    const second = read("category/inspired/page/2/index.html");
    expect(second).toContain("<title>感悟 - 第 2 页 | 新闻聚焦</title>");
    expect(second).toContain("栏目文章（第 2 页）");
    expect(ld(second)).toBeNull();

    expect(read("sitemap.xml")).toContain(
      `<loc>${origin}/${encodeURIComponent(slug)}/</loc><lastmod>2026-11-10</lastmod>`
    );
    const feed = read("feed.xml");
    expect(feed).toContain(`<link>${origin}/${encodeURIComponent(slug)}/</link>`);
    expect(feed).toContain("<title>没有配图 &lt;的&gt; 文章</title>");
    expect(feed.indexOf("测试文章：标题")).toBeLessThan(feed.indexOf("没有配图"));
  }, 30_000);

  it("圖片帶上寬高，橫幅不放大超過原圖", async () => {
    // 1×1 的 PNG 檔頭改成 556×344，後面補到夠大。
    const png = (width: number, height: number) => {
      const bytes = Buffer.alloc(9000, 0);
      Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(bytes);
      bytes.writeUInt32BE(width, 16);
      bytes.writeUInt32BE(height, 20);
      return bytes;
    };
    fs.writeFileSync(
      path.join(dir, "site.json"),
      JSON.stringify({ hero: { image: "/media/site-hero.png" } })
    );
    await addArticle(source, structured, {
      dir,
      now,
      download: async () => ({
        bytes: png(1200, 800),
        contentType: "image/png",
        extension: "png",
      }),
    });
    fs.writeFileSync(path.join(dir, "media/site-hero.png"), png(556, 344));
    const outDir = path.join(dir, "dist");
    await buildSite({ contentDir: dir, outDir, basePath: "/" });
    const read = (file: string) =>
      fs.readFileSync(path.join(outDir, file), "utf8");
    const home = read("index.html");
    expect(home).toMatch(
      /<img src="\/media\/site-hero\.png"[^>]*style="max-width:556px"[^>]*width="556" height="344"/
    );
    expect(home).toMatch(
      new RegExp(`<img src="/media/${prefix}-1\\.png"[^>]*width="1200" height="800"`)
    );
    const article = read(`${slug}/index.html`);
    expect(article.match(/width="1200" height="800"/g)!.length).toBeGreaterThan(1);
    expect(JSON.parse(read("search-index.json"))[0].size).toEqual([1200, 800]);
  }, 30_000);

  it("草稿的圖片不發佈", async () => {
    await addArticle(source, structured, { dir, download, now });
    await addArticle(
      { ...source, sourceUrl: "https://publisher.example.com/draft" },
      { ...structured, title: "草稿文章" },
      { dir, download, now, draft: true }
    );
    const draftPrefix = mediaPrefix("草稿文章", now, "/nonexistent");
    expect(fs.existsSync(path.join(dir, `media/${draftPrefix}-1.jpg`))).toBe(
      true
    );
    const outDir = path.join(dir, "dist");
    await buildSite({ contentDir: dir, outDir, basePath: "/" });
    const published = fs.readdirSync(path.join(outDir, "media"));
    expect(published).toContain(`${prefix}-1.jpg`);
    expect(published.some(file => file.startsWith(draftPrefix))).toBe(false);
  }, 30_000);

  it("獨立頁面有自己的網址，內文連結可點，不進首頁、分類頁與搜尋", async () => {
    fs.writeFileSync(
      path.join(dir, "site.json"),
      JSON.stringify({
        hero: { image: "/media/site-hero.png", link: "/about/" },
      })
    );
    await addArticle(source, structured, { dir, download, now });
    fs.mkdirSync(path.join(dir, "pages"));
    fs.writeFileSync(
      path.join(dir, "pages/about.md"),
      "---\ntitle: 关于本站\ndate: 2026-01-01T00:00:00.000Z\n---\n\n说明文字。\n\n[《视频》](https://v.example/1)\n"
    );
    const outDir = path.join(dir, "dist");
    await buildSite({
      contentDir: dir,
      outDir,
      basePath: "/repo",
      siteUrl: "https://user.github.io/repo",
    });
    const read = (file: string) =>
      fs.readFileSync(path.join(outDir, file), "utf8");
    const page = read("about/index.html");
    expect(page).toContain("<title>关于本站 | 新闻聚焦</title>");
    expect(page).toContain('name="description" content="说明文字。"');
    expect(page).toMatch(/<a href="https:\/\/v\.example\/1"[^>]*>《视频》<\/a>/);
    const home = read("index.html");
    expect(home).toMatch(/<a href="\/repo\/about\/"[^>]*><img/);
    expect(home).not.toContain("关于本站");
    expect(read("category/inspired/index.html")).not.toContain("关于本站");
    expect(JSON.parse(read("search-index.json"))).toHaveLength(1);
    expect(read("sitemap.xml")).toContain("https://user.github.io/repo/about/");
    // site.json 的 url 是正式網址：掛在子路徑的副本，canonical 與 sitemap 也指向它。
    fs.writeFileSync(
      path.join(dir, "site.json"),
      JSON.stringify({ url: "https://news.example/" })
    );
    await buildSite({ contentDir: dir, outDir, basePath: "/repo" });
    expect(read("sitemap.xml")).toContain("https://news.example/about/");
    expect(read("about/index.html")).toContain(
      'rel="canonical" href="https://news.example/about/"'
    );
    expect(read("robots.txt")).toContain("https://news.example/sitemap.xml");
    // 文章和頁面不能用同一個網址。
    fs.writeFileSync(
      path.join(dir, `pages/${slug}.md`),
      "---\ntitle: 撞名\ndate: 2026-01-01T00:00:00.000Z\n---\n\n内容\n"
    );
    await expect(buildSite({ contentDir: dir, outDir })).rejects.toThrow(
      "網址相同"
    );
  }, 30_000);
  it("頁面的下載檔案：留下電子郵件才顯示連結，檔案發佈到 /downloads/", async () => {
    fs.mkdirSync(path.join(dir, "pages"));
    fs.mkdirSync(path.join(dir, "downloads"));
    fs.writeFileSync(path.join(dir, "downloads/甲文.pdf"), "%PDF-1.4");
    fs.writeFileSync(path.join(dir, "downloads/未用.pdf"), "%PDF-1.4");
    fs.writeFileSync(
      path.join(dir, "pages/get.md"),
      "---\ntitle: 下载\ndate: 2026-01-01T00:00:00.000Z\ndownloads: 甲文.pdf\n---\n\n说明。\n"
    );
    const outDir = path.join(dir, "dist");
    await buildSite({ contentDir: dir, outDir, basePath: "/repo" });
    const page = fs.readFileSync(path.join(outDir, "get/index.html"), "utf8");
    expect(page).toContain('action="/repo/api/subscribe"');
    expect(page).toMatch(/<div id="download-links" hidden="">[\s\S]*href="\/repo\/downloads\/%E7%94%B2%E6%96%87\.pdf"/);
    expect(page).toMatch(/src="\/repo\/assets\/download\.[0-9a-f]+\.js"/);
    expect(fs.existsSync(path.join(outDir, "downloads/甲文.pdf"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "downloads/未用.pdf"))).toBe(false);
    expect(fs.readFileSync(path.join(outDir, "index.html"), "utf8")).not.toContain("download.");
    fs.writeFileSync(
      path.join(dir, "pages/get.md"),
      "---\ntitle: 下载\ndate: 2026-01-01T00:00:00.000Z\ndownloads: 缺少.pdf\n---\n\n说明。\n"
    );
    await expect(buildSite({ contentDir: dir, outDir })).rejects.toThrow("缺少.pdf");
  });
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
