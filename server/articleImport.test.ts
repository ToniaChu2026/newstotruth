import { describe, expect, it } from "vitest";
import {
  extractImages,
  htmlToReadableText,
  htmlToReadableTextWithImageMarkers,
  importToWordPress,
  normalizeAiArticle,
  retainPersistedImageMarkers,
  structureArticle,
} from "./articleImport";
import { WordPressClient } from "./wordpress";

describe("來源網頁解析", () => {
  it("移除腳本與樣式，保留可讀段落", () => {
    const readable = htmlToReadableText(
      "<article><h1>標題</h1><p>第一段。</p><script>ignore()</script><style>.x{}</style><p>第二段 &amp; 內容。</p></article>"
    );
    expect(readable).toContain("標題");
    expect(readable).toContain("第一段。");
    expect(readable).toContain("第二段 & 內容。");
    expect(readable).not.toContain("ignore");
  });

  it("解析、去重並依序編號圖片，略過裝飾性小圖", () => {
    const images = extractImages(
      '<img src="/hero.jpg" alt="Hero"><img src="/hero.jpg"><img src="data:image/png;base64,aaa"><img data-src="https://cdn.example.com/inline.webp" alt="Inline"><img src="/logo.png" alt="logo"><img src="/tiny.png" width="32" height="32">',
      "https://publisher.example.com/story"
    );
    expect(images).toEqual([
      {
        url: "https://publisher.example.com/hero.jpg",
        altText: "Hero",
        index: 0,
      },
      {
        url: "https://cdn.example.com/inline.webp",
        altText: "Inline",
        index: 1,
      },
    ]);
  });

  it("保留每張圖片相對於前後文字的位置", () => {
    const source = htmlToReadableTextWithImageMarkers(
      '<article><p>圖前。</p><img src="/first.jpg"><p>圖間。</p><img src="/second.jpg"><p>圖後。</p></article>',
      "https://publisher.example.com/story"
    );
    expect(source.indexOf("圖前。")).toBeLessThan(
      source.indexOf("{{image:0}}")
    );
    expect(source.indexOf("{{image:0}}")).toBeLessThan(
      source.indexOf("圖間。")
    );
    expect(source.indexOf("圖間。")).toBeLessThan(
      source.indexOf("{{image:1}}")
    );
    expect(source.indexOf("{{image:1}}")).toBeLessThan(
      source.indexOf("圖後。")
    );
  });

  it("只移除失敗圖片的標記，不移動其他圖片", () => {
    const result = retainPersistedImageMarkers(
      "一。\n\n{{image:0}}\n\n二。\n\n{{image:1}}\n\n三。",
      [1]
    );
    expect(result).not.toContain("{{image:0}}");
    expect(result.indexOf("二。")).toBeLessThan(result.indexOf("{{image:1}}"));
    expect(result.indexOf("{{image:1}}")).toBeLessThan(result.indexOf("三。"));
  });
});

describe("AI 回傳欄位正規化", () => {
  const body =
    "這是一段足夠長的正文內容，用來通過最小長度檢查。{{image:0}} 後面還有文字。";

  it("分類不在七個固定分類內時退回「最新」", () => {
    const article = normalizeAiArticle(
      {
        title: "標題",
        summary: "摘要",
        content: body,
        category: "科技",
        tags: ["a"],
      },
      "備用標題",
      ["{{image:0}}"]
    );
    expect(article.category).toBe("最新");
  });

  it("接受合法分類並最多保留六個標籤", () => {
    const article = normalizeAiArticle(
      {
        title: "標題",
        summary: "摘要",
        content: body,
        category: "述评",
        tags: ["1", "2", "3", "4", "5", "6", "7"],
      },
      "",
      ["{{image:0}}"]
    );
    expect(article.category).toBe("述评");
    expect(article.tags).toHaveLength(6);
  });

  it("圖片標記被弄丟時拒絕結果", () => {
    expect(() =>
      normalizeAiArticle(
        {
          title: "t",
          summary: "s",
          content:
            "正文沒有圖片標記，但這一段的長度足夠通過最小長度檢查，所以應該因為標記遺失而被拒絕。",
          category: "最新",
          tags: [],
        },
        "",
        ["{{image:0}}"]
      )
    ).toThrow(/圖片位置/);
  });

  it("來源文字太短時不呼叫 AI", async () => {
    await expect(
      structureArticle("https://a.example/x", "太短", "t", async () => ({}))
    ).rejects.toThrow(/可讀文字/);
  });
});

type Call = { method: string; path: string; body?: unknown };

function fakeWordPress(calls: Call[], options: { existing?: boolean } = {}) {
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/wp-json/wp/v2", "") + url.search;
    const method = init?.method ?? "GET";
    let body: unknown;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    else if (init?.body instanceof FormData)
      body = {
        filename: (init.body.get("file") as File).name,
        alt_text: init.body.get("alt_text"),
      };
    calls.push({ method, path, body });
    const respond = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (path.startsWith("/posts?status=any&per_page=10&source_url=")) {
      return respond(
        options.existing
          ? [
              {
                id: 77,
                link: "https://site.example/?p=77",
                status: "draft",
                title: { rendered: "既有文章" },
                meta: { source_url: "https://publisher.example.com/story" },
              },
            ]
          : []
      );
    }
    if (path.startsWith("/tags?search="))
      return respond(
        url.searchParams.get("search") === "既有"
          ? [{ id: 5, name: "既有" }]
          : []
      );
    if (path === "/tags" && method === "POST")
      return respond({ id: 9, name: (body as { name: string }).name });
    if (path === "/media" && method === "POST")
      return respond({
        id: 300 + calls.length,
        source_url: `https://site.example/wp-content/uploads/${(body as { filename: string }).filename}`,
      });
    if (path === "/posts" && method === "POST")
      return respond({
        id: 123,
        link: "https://site.example/?p=123",
        status: "draft",
        title: { rendered: (body as { title: string }).title },
      });
    return respond(
      { code: "not_found", message: `unexpected ${method} ${path}` },
      404
    );
  };
  return new WordPressClient({
    baseUrl: "https://site.example",
    username: "u",
    appPassword: "p",
    fetchImpl,
  });
}

const validateUrl = async (value: string) => new URL(value);

const html =
  '<html><head><title>Fallback</title></head><body><article><p>第一段文字，長度足以通過最小長度檢查，這裡再多寫一些內容，讓整篇可讀文字超過八十個字的門檻，避免被當成空白頁面而拒絕匯入，所以再補上一些敘述句子。</p><img src="/a.jpg" alt="A 圖"><p>第二段文字。</p><img src="/b.jpg" alt="B 圖"><p>第三段文字。</p></article></body></html>';

describe("匯入到 WordPress", () => {
  it("建立草稿：圖片依位置插入、首圖設為特色圖片、記錄來源網址", async () => {
    const calls: Call[] = [];
    const wp = fakeWordPress(calls);
    const stages: string[] = [];
    const result = await importToWordPress(
      "https://publisher.example.com/story",
      {
        wp,
        validateUrl,
        fetchPage: async () => ({
          html,
          finalUrl: "https://publisher.example.com/story",
        }),
        structure: async ({ sourceText }) => ({
          title: "整理後標題",
          summary: "這是摘要",
          content: sourceText,
          category: "文化",
          tags: ["既有", "新標籤"],
        }),
        download: async candidate => ({
          bytes: Buffer.from(candidate.url),
          contentType: "image/jpeg",
          extension: "jpg",
        }),
        onProgress: stage => stages.push(stage),
      }
    );

    expect(result.duplicate).toBe(false);
    expect(result.postId).toBe(123);
    expect(result.editUrl).toBe(
      "https://site.example/wp-admin/post.php?post=123&action=edit"
    );
    expect(result.imageCount).toBe(2);
    expect(result.category).toBe("文化");
    expect(Array.from(new Set(stages))).toEqual([
      "fetch",
      "structure",
      "images",
      "draft",
    ]);

    const post = calls.find(
      call => call.path === "/posts" && call.method === "POST"
    )!.body as Record<string, unknown>;
    expect(post.status).toBe("draft");
    expect(post.categories).toEqual([15]);
    expect(post.tags).toEqual([5, 9]);
    expect(post.featured_media).toBe(
      calls.filter(call => call.path === "/media").length
        ? 300 + calls.findIndex(call => call.path === "/media") + 1
        : 0
    );
    expect(post.meta).toEqual({
      source_url: "https://publisher.example.com/story",
    });
    const content = post.content as string;
    expect(content).toContain(
      '<p class="wp-block-paragraph" style="font-size:16px">第一段文字'
    );
    expect(content.indexOf("第一段")).toBeLessThan(content.indexOf("第二段"));
    // 首圖是特色圖片，不再放進內文；第二張圖在第二段與第三段之間。
    expect(content.match(/<!-- wp:image/g)).toHaveLength(1);
    expect(content.indexOf("第二段")).toBeLessThan(
      content.indexOf("<!-- wp:image")
    );
    expect(content.indexOf("<!-- wp:image")).toBeLessThan(
      content.indexOf("第三段")
    );
    expect(content).toContain("原文链接：");
  });

  it("圖片下載失敗時略過該張，不中斷整篇", async () => {
    const calls: Call[] = [];
    const result = await importToWordPress(
      "https://publisher.example.com/story",
      {
        wp: fakeWordPress(calls),
        validateUrl,
        fetchPage: async () => ({
          html,
          finalUrl: "https://publisher.example.com/story",
        }),
        structure: async ({ sourceText }) => ({
          title: "標題",
          summary: "摘要",
          content: sourceText,
          category: "最新",
          tags: [],
        }),
        download: async candidate => {
          if (candidate.index === 0) throw new Error("boom");
          return {
            bytes: Buffer.alloc(10),
            contentType: "image/png",
            extension: "png",
          };
        },
      }
    );
    expect(result.imageCount).toBe(1);
    expect(result.skippedImages).toBe(1);
    const post = calls.find(call => call.path === "/posts")!.body as Record<
      string,
      unknown
    >;
    expect(post.content as string).not.toContain("{{image:");
  });

  it("同一來源網址已匯入過時直接回傳既有文章", async () => {
    const calls: Call[] = [];
    const result = await importToWordPress(
      "https://publisher.example.com/story",
      {
        wp: fakeWordPress(calls, { existing: true }),
        validateUrl,
        fetchPage: async () => {
          throw new Error("不應該抓取");
        },
        structure: async () => {
          throw new Error("不應該呼叫 AI");
        },
      }
    );
    expect(result.duplicate).toBe(true);
    expect(result.postId).toBe(77);
    expect(
      calls.some(call => call.path === "/posts" && call.method === "POST")
    ).toBe(false);
  });
});
