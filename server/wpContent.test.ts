import { describe, expect, it } from "vitest";
import {
  buildGutenbergContent,
  markerOrder,
  paragraphBlock,
  splitParagraphs,
} from "./wpContent";

describe("Gutenberg 區塊組裝", () => {
  it("段落使用與站上一致的 16px 段落區塊並跳脫 HTML", () => {
    expect(paragraphBlock("a <b> & c")).toBe(
      '<!-- wp:paragraph {"style":{"typography":{"fontSize":"16px"}}} -->\n<p class="wp-block-paragraph" style="font-size:16px">a &lt;b&gt; &amp; c</p>\n<!-- /wp:paragraph -->'
    );
  });

  it("單換行與雙換行都視為段落分隔", () => {
    expect(splitParagraphs("一\n二\n\n三\r\n四")).toEqual([
      "一",
      "二",
      "三",
      "四",
    ]);
  });

  it("依出現順序列出圖片標記並去重", () => {
    expect(markerOrder("{{image:2}} x {{image:0}} y {{image:2}}")).toEqual([
      2, 0,
    ]);
  });

  it("圖片標記換成圖片區塊，特色圖片不重複放入內文，文末附原文連結", () => {
    const images = new Map([
      [0, { index: 0, mediaId: 10, url: "https://s/a.jpg", altText: 'A "圖"' }],
      [
        1,
        {
          index: 1,
          mediaId: 11,
          url: "https://s/b.jpg",
          altText: "B",
          caption: "圖說",
        },
      ],
    ]);
    const html = buildGutenbergContent(
      "{{image:0}}\n\n第一段{{image:1}}第二段\n\n{{image:9}}",
      images,
      { sourceUrl: "https://src.example/x?a=1&b=2", featuredIndex: 0 }
    );
    expect(html).not.toContain("wp-image-10");
    expect(html).toContain(
      '<!-- wp:image {"id":11,"sizeSlug":"large","linkDestination":"none"} -->'
    );
    expect(html).toContain(
      '<figcaption class="wp-element-caption">圖說</figcaption>'
    );
    expect(html.indexOf("第一段")).toBeLessThan(html.indexOf("wp-image-11"));
    expect(html.indexOf("wp-image-11")).toBeLessThan(html.indexOf("第二段"));
    expect(html).not.toContain("{{image:9}}");
    expect(html).toContain('href="https://src.example/x?a=1&amp;b=2"');
  });
});
