"""
從「真相聚焦 新闻周刊」的 .docx 拆出每篇文章（標題、段落、小標題、圖片、圖說、原文链接）。

用法：python3 -I scripts/xwzk/extract_docx.py <輸出資料夾> <docx 檔...>
輸出 <輸出資料夾>/articles.json，以及 docx 內的圖片檔。
檔名需含 YYMMDD（例如 XWZK-260531.docx），作為該期的日期。
"""
import html
import json
import os
import re
import sys
import zipfile

W_P = re.compile(r"<w:p[ >][\s\S]*?</w:p>")
W_R = re.compile(r"<w:r[ >][\s\S]*?</w:r>")
W_T = re.compile(r"<w:t(?: [^>]*)?>([^<]*)</w:t>")
CAPTION = re.compile(r"^图\s*\d+\s*[：:]\s*")


def norm(text):
    return re.sub(r"[\s　]+", "", text)


def runs_info(p):
    """回傳 (文字, 是否整段粗體, 是否整段斜體, 最大字號)。"""
    bold = italic = True
    size = 0
    any_text = False
    for r in W_R.findall(p):
        t = "".join(W_T.findall(r))
        if not t.strip():
            continue
        any_text = True
        rpr = re.search(r"<w:rPr>([\s\S]*?)</w:rPr>", r)
        rpr = rpr.group(1) if rpr else ""
        if not re.search(r"<w:b(?: w:val=\"(?:1|true)\")?/>", rpr):
            bold = False
        if not re.search(r"<w:i(?: w:val=\"(?:1|true)\")?/>", rpr):
            italic = False
        for s in re.findall(r'<w:sz w:val="(\d+)"/>', rpr):
            size = max(size, int(s))
    text = html.unescape("".join(W_T.findall(p))).strip()
    return text, bold and any_text, italic and any_text, size


def extract(path, out_dir):
    name = os.path.basename(path)
    m = re.search(r"(\d{2})(\d{2})(\d{2})", name)
    issue = f"20{m.group(1)}-{m.group(2)}-{m.group(3)}"
    z = zipfile.ZipFile(path)
    doc = z.read("word/document.xml").decode("utf8")
    rels_xml = z.read("word/_rels/document.xml.rels").decode("utf8")
    rels = {}
    for rel in re.findall(r"<Relationship [^>]*>", rels_xml):
        rid = re.search(r'Id="([^"]+)"', rel)
        target = re.search(r'Target="([^"]+)"', rel)
        if rid and target:
            rels[rid.group(1)] = target.group(1)

    paras = []
    for p in W_P.findall(doc):
        text, bold, italic, size = runs_info(p)
        blips = re.findall(r'<a:blip [^>]*r:embed="([^"]+)"', p)
        paras.append({"text": text, "bold": bold, "italic": italic, "size": size, "blips": blips})

    texts = [norm(p["text"]) for p in paras]
    toc_at = next((i for i, t in enumerate(texts) if t == "目录"), None)
    if toc_at is None:
        raise SystemExit(f"{name}: 找不到目录")
    toc = []
    i = toc_at + 1
    while i < len(paras) and texts[i] and texts[i] not in toc:
        toc.append(texts[i])
        i += 1

    articles = []
    current = None
    image_no = 0
    for idx in range(i, len(paras)):
        p = paras[idx]
        t = p["text"]
        # 第一篇：目录之後的第一行字（內文標題可能和目录寫法不同）；
        # 之後每篇：上一篇原文链接之後的第一行字。
        starts_first = current is None and bool(texts[idx]) and not p["blips"]
        starts_next = (
            current is not None
            and current.get("source")
            and texts[idx]
            and len(articles) < len(toc)
        )
        if starts_first or starts_next:
            current = {
                "issue": issue,
                "file": name,
                "order": len(articles),
                "title": re.sub(r"[\s　]+", " ", t).strip(),
                "source": None,
                "blocks": [],
            }
            articles.append(current)
            continue
        if current is None or current.get("source"):
            continue
        if current.get("await_link"):
            url = re.match(r"^(https?://\S+)", t)
            if url:
                current["source"] = url.group(1)
                del current["await_link"]
                continue
        link = re.match(r"^原文[链連]接\s*[：:]?\s*(\S*)", t)
        if link:
            if link.group(1).startswith("http"):
                current["source"] = link.group(1)
            else:
                current["await_link"] = True
            continue
        for rid in p["blips"]:
            target = rels.get(rid, "")
            if not target.startswith("media/"):
                continue
            data = z.read("word/" + target)
            ext = os.path.splitext(target)[1].lower().lstrip(".") or "jpg"
            image_no += 1
            fname = f"{issue.replace('-', '')}-{image_no:03d}.{ext}"
            with open(os.path.join(out_dir, fname), "wb") as fh:
                fh.write(data)
            current["blocks"].append({"type": "img", "file": fname, "caption": None})
        if not t:
            continue
        last = current["blocks"][-1] if current["blocks"] else None
        if CAPTION.match(t) or (p["blips"] and t) or (p["italic"] and last and last["type"] == "img"):
            caption = CAPTION.sub("", t).strip()
            if last and last["type"] == "img" and not last["caption"]:
                last["caption"] = caption
            else:
                current["blocks"].append({"type": "caption", "text": caption})
            continue
        if p["bold"] and len(norm(t)) <= 60 and not t.endswith(("。", "！”", "。”")):
            current["blocks"].append({"type": "h", "text": t})
            continue
        current["blocks"].append({"type": "p", "text": t})
    def similar(x, y):
        x, y = norm(x), norm(y)
        x = re.sub(r"[（(](?:组)?图[）)]$", "", x)
        return bool(x and y) and (x == y or x in y or y in x or x[:8] == y[:8])

    for article in articles:
        article.pop("await_link", None)
        if not any(similar(article["title"], t) for t in toc):
            # 抓到的「標題」其實是系列名稱或圖說；改用前幾段裡和目录相符的那一行。
            for k, block in enumerate(article["blocks"][:3]):
                if block["type"] in ("h", "p") and any(
                    similar(block["text"], t) for t in toc
                ):
                    article["kicker"] = article["title"]
                    article["title"] = block["text"]
                    del article["blocks"][k]
                    break
        article["title"] = re.sub(r"[\s\u3000]+", " ", article["title"]).strip()
        article["title"] = re.sub(r"\s*[（(](?:组)?图[）)]\s*$", "", article["title"])
    missing = [a["title"] for a in articles if not a["source"]]
    return toc, articles, missing


def main():
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    everything = []
    for path in sorted(sys.argv[2:], key=os.path.basename):
        toc, articles, missing = extract(path, out_dir)
        print(f"{os.path.basename(path)}: 目录 {len(toc)} 篇，拆出 {len(articles)} 篇，缺原文链接 {len(missing)}")
        for title in missing:
            print("   缺原文链接：", title)
        everything.extend(articles)
    with open(os.path.join(out_dir, "articles.json"), "w", encoding="utf8") as fh:
        json.dump(everything, fh, ensure_ascii=False, indent=1)
    print("合计", len(everything), "篇")


main()
