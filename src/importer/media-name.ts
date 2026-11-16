/**
 * 圖片檔名：用文章標題的拼音，讓檔名看得出是哪篇文章的圖。
 * 例如〈三天遭42亿次网攻 退党中心：攻不破22年坚守〉→ santianzao42yiciwanggong-tuidangzhongxin-gongbu（最長 48 字元），
 * 同一篇的圖片再接 -1、-2、-3。
 */
import { pinyin } from "pinyin-pro";

const MAX_LENGTH = 48;

/** 標題轉成拼音片段：同一段文字的拼音連在一起，標點或空白處用 - 分開。 */
export function titleToPinyin(title: string) {
  const cleaned = title
    .replace(/^【[^】]{0,12}】/, "")
    .normalize("NFKC")
    .toLowerCase();
  // 整段漢字一起轉，多音字（长、重、行……）才會依詞語選對讀音。
  // 每一段拆成音節（英文、數字整串算一個），放不下整段時取能放下的前幾個音節。
  const words = (cleaned.match(/[\p{Script=Han}a-z0-9]+/gu) ?? []).map(word =>
    (word.match(/\p{Script=Han}+|[a-z0-9]+/gu) ?? []).flatMap(part =>
      /\p{Script=Han}/u.test(part)
        ? pinyin(part, { toneType: "none", type: "array" }).map(s =>
            s.replace(/ü/g, "v")
          )
        : [part]
    )
  );
  let name = "";
  for (const syllables of words) {
    let piece = "";
    for (const syllable of syllables) {
      const candidate = `${name ? `${name}-` : ""}${piece}${syllable}`;
      if (candidate.length > MAX_LENGTH) break;
      piece += syllable;
    }
    if (piece) name = name ? `${name}-${piece}` : piece;
    if (piece !== syllables.join("")) break;
  }
  return name || "image";
}

/**
 * 某篇文章的圖片檔名前綴（不含 -1、-2）。
 * isTaken(prefix) 回傳 true 表示這個前綴已經被別篇文章用掉，
 * 這時依序改用「前綴-日期」「前綴-日期-2」……。
 */
export function uniqueMediaPrefix(
  title: string,
  day: string,
  isTaken: (prefix: string) => boolean
) {
  const base = titleToPinyin(title);
  if (!isTaken(base)) return base;
  const dated = `${base}-${day}`;
  if (!isTaken(dated)) return dated;
  for (let n = 2; ; n += 1)
    if (!isTaken(`${dated}-${n}`)) return `${dated}-${n}`;
}
