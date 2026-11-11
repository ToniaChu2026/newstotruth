import { describe, expect, it } from "vitest";
import {
  extractImages,
  htmlToReadableText,
  htmlToReadableTextWithImageMarkers,
  normalizeAiArticle,
  retainPersistedImageMarkers,
  structureArticle,
} from "./fetch";

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

  it("可以刪掉裝飾性圖片的標記", () => {
    const article = normalizeAiArticle(
      {
        title: "t",
        summary: "s",
        content:
          "正文刪掉了第一張圖的標記，只留下第二張。{{image:1}} 這一段的長度足夠通過檢查。",
        category: "最新",
        tags: [],
      },
      "",
      ["{{image:0}}", "{{image:1}}"]
    );
    expect(article.content).toContain("{{image:1}}");
  });

  it("標記憑空多出來或順序調換時拒絕結果", () => {
    const make = (content: string) => () =>
      normalizeAiArticle(
        { title: "t", summary: "s", content, category: "最新", tags: [] },
        "",
        ["{{image:0}}", "{{image:1}}"]
      );
    const filler = "這一段的長度足夠通過最小長度檢查，後面接圖片標記。";
    expect(make(`${filler}{{image:5}}`)).toThrow(/對不上/);
    expect(make(`${filler}{{image:1}}${filler}{{image:0}}`)).toThrow(/對不上/);
  });

  it("來源文字太短時不呼叫 AI", async () => {
    await expect(
      structureArticle("https://a.example/x", "太短", "t", async () => ({}))
    ).rejects.toThrow(/可讀文字/);
  });
});
