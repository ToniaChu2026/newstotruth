/**
 * 產生幾篇示例文章，方便在還沒匯入真實文章前預覽版面。
 * 用法：corepack pnpm seed:demo　（文章可在後台逐篇刪除）
 */
import "dotenv/config";
import { siteStore } from "../server/siteStore";

const store = siteStore();
const palettes = [
  ["#f6d365", "#fda085"],
  ["#84fab0", "#8fd3f4"],
  ["#a18cd1", "#fbc2eb"],
  ["#fccb90", "#d57eeb"],
  ["#5ee7df", "#b490ca"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#43e97b", "#38f9d7"],
  ["#30cfd0", "#330867"],
];
const samples: Array<[string, string, number]> = [
  ["聚焦", "示例文章：社区志愿者清理河岸 一个周末带走三吨垃圾", 500],
  ["述评", "示例文章：为什么慢新闻值得被重新重视", 640],
  ["最新", "示例文章：本地图书馆延长开放时间至晚间十点", 420],
  ["特稿", "示例文章：一座老车站的最后一个冬天", 700],
  ["感悟", "示例文章：父亲留下的那本笔记", 560],
  ["文化", "示例文章：皮影戏班走进小学课堂", 460],
  ["历史", "示例文章：从一枚邮票看百年前的通信", 620],
  ["聚焦", "示例文章：雨季来临前 山村修好了第一条排水渠", 480],
  ["最新", "示例文章：周末市集迎来春季首场开张", 540],
  ["文化", "示例文章：古琴修复师的十年", 0],
];
const paragraph =
  "这是一段示例内容，用来展示文章页的排版效果，并不是真实报道。正式使用时，请在后台贴上已获授权的文章网址，由 AI 匯入工具整理成标题、摘要、正文、分类与标签，检查后再发布。";

samples.forEach(([category, title, height], index) => {
  let image: string | null = null;
  if (height) {
    const [from, to] = palettes[index % palettes.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="${height}" fill="url(#g)"/><circle cx="${180 + index * 50}" cy="${height * 0.45}" r="${height * 0.22}" fill="#fff" fill-opacity=".25"/></svg>`;
    image = store.saveMedia(Buffer.from(svg), `demo-${index + 1}.svg`).url;
  }
  const post = store.create({
    title,
    excerpt: `${paragraph.slice(0, 60 + (index % 4) * 25)}……`,
    blocks: [
      { type: "p", text: paragraph },
      { type: "p", text: paragraph },
      ...(image
        ? [{ type: "img" as const, url: image, alt: "示例图片", caption: "示例图片说明" }]
        : []),
      { type: "p", text: paragraph },
    ],
    category,
    tags: ["示例"],
    image,
    sourceUrl: null,
  });
  store.setStatus(post.id, "published");
});
console.log(`已建立 ${samples.length} 篇示例文章。`);
