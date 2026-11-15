/**
 * 存進 content/media/ 的圖片統一縮小，避免 repo 越來越大：
 * 大張的 PNG 照片轉成 JPEG，長邊縮到 1600 像素並重新壓縮。
 * 只在 macOS（有 sips）上處理，其他系統原樣保留。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** 寫入圖片並縮小；回傳實際的檔名（PNG 轉成 JPEG 時副檔名會變）。 */
export function saveCompactImage(file: string, bytes: Buffer) {
  fs.writeFileSync(file, bytes);
  if (process.platform !== "darwin") return path.basename(file);
  let target = file;
  if (/\.png$/i.test(file) && bytes.length > 500_000) {
    const jpg = file.replace(/\.png$/i, ".jpg");
    const result = spawnSync(
      "sips",
      ["-s", "format", "jpeg", "-s", "formatOptions", "82", file, "--out", jpg],
      { stdio: "ignore" }
    );
    if (result.status === 0 && fs.existsSync(jpg)) {
      fs.rmSync(file);
      target = jpg;
    }
  }
  if (/\.(jpe?g|png)$/i.test(target) && fs.statSync(target).size > 350_000) {
    spawnSync("sips", ["-Z", "1600", target], { stdio: "ignore" });
    if (/\.jpe?g$/i.test(target))
      spawnSync("sips", ["-s", "formatOptions", "82", target], {
        stdio: "ignore",
      });
  }
  return path.basename(target);
}
