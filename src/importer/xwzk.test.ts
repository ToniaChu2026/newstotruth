import { describe, expect, it } from "vitest";
import {
  assembleBlocks,
  excerptFrom,
  placeSourceImages,
  type DocxBlock,
} from "./xwzk";

const blocks: DocxBlock[] = [
  {
    type: "p",
    text: "【大纪元2026年05月30日讯】（记者报导）第一段正文的内容在这里，够长。",
  },
  { type: "h", text: "小标题一" },
  { type: "p", text: "第二段正文，讲述事件经过的细节内容。" },
  { type: "p", text: "第三段正文，最后的结论与展望内容。" },
];

const page = [
  "首页 新闻",
  "{{image:0}}",
  "网站标题：测试文章标题",
  "{{image:1}}",
  "首图的图说。（图片来源：某某）",
  "【大纪元2026年05月30日讯】（记者报导）第一段正文的内容在这里，够长。",
  "小标题一",
  "{{image:2}}",
  "第二段正文，讲述事件经过的细节内容。",
  "{{image:3}}",
  "内文第二张图的说明",
  "第三段正文，最后的结论与展望内容。",
  "相关文章",
  "{{image:4}}",
].join("\n\n");

describe("對齊原文圖片", () => {
  it("首圖取標題與正文之間的圖，內文圖依段落放回，圖說取下一行", () => {
    const placed = placeSourceImages(
      { title: "测试文章标题", blocks },
      page,
      10,
      ["https://a.example/logo.png", "", "", "", ""]
    );
    expect(placed).toEqual([
      { index: 1, after: -1, caption: "首图的图说。（图片来源：某某）" },
      { index: 2, after: 1, caption: null },
      { index: 3, after: 2, caption: "内文第二张图的说明" },
    ]);
  });

  it("docx 把圖說當成正文時，像圖說的那段改當圖說並從正文拿掉", () => {
    const withCaption: DocxBlock[] = [
      ...blocks.slice(0, 3),
      { type: "p", text: "示意图的说明文字。（大纪元AI制图）" },
      blocks[3],
    ];
    const source = [
      "测试文章标题",
      ...blocks.slice(0, 3).map(block => (block.type === "img" ? "" : block.text)),
      "{{image:0}}",
      "示意图的说明文字。（大纪元AI制图）",
      "第三段正文，最后的结论与展望内容。",
    ].join("\n\n");
    const placed = placeSourceImages(
      { title: "测试文章标题", blocks: withCaption },
      source
    );
    expect(placed).toEqual([
      { index: 0, after: 2, caption: "示意图的说明文字。（大纪元AI制图）", replaces: 3 },
    ]);
    const { blocks: out } = assembleBlocks(
      withCaption,
      placed!.map(image => ({ ...image, url: "/media/a.jpg", alt: "" }))
    );
    expect(out.filter(block => block.type === "p")).toHaveLength(3);
  });

  it("網頁裡找不到正文時回傳 null", () => {
    expect(
      placeSourceImages({ title: "x", blocks }, "完全无关的网页内容")
    ).toBeNull();
  });

  it("組成正文：圖片插在對應段落後，第一張抽出當首圖", () => {
    const { blocks: out, featured } = assembleBlocks(blocks, [
      { url: "/media/a.jpg", alt: "a", caption: "首图", after: -1 },
      { url: "/media/b.jpg", alt: "b", caption: null, after: 2 },
    ]);
    expect(featured).toEqual({ url: "/media/a.jpg", caption: "首图" });
    expect(out.map(block => block.type)).toEqual(["p", "h", "p", "img", "p"]);
  });
});

describe("摘要", () => {
  it("去掉來源抬頭與記者署名", () => {
    const lead: DocxBlock[] = [
      {
        type: "p",
        text: "【大纪元2026年05月30日讯】（大纪元记者某某报导）美国宾州一名女子在吃牛排噎到后经历濒死体验，其间就像看电影一样回顾了自己的一生。",
      },
    ];
    expect(excerptFrom(lead)).toBe(
      "美国宾州一名女子在吃牛排噎到后经历濒死体验，其间就像看电影一样回顾了自己的一生。"
    );
  });

  it("太長時在句號處截斷", () => {
    const long =
      "第一句话很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长。".repeat(
        6
      );
    const text = excerptFrom([{ type: "p", text: long }], 120);
    expect(text.endsWith("。")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(120);
  });
});
