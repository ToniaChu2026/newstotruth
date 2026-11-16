/**
 * 讀出圖片的像素寬高（JPEG、PNG、GIF、WebP），產生網站時寫進 <img> 的 width / height，
 * 瀏覽器在圖片載入前就能留出位置，版面不會跳動。只讀檔頭，不解碼整張圖。
 */
import fs from "node:fs";

export type ImageSize = { width: number; height: number };

function jpegSize(bytes: Buffer): ImageSize | null {
  let offset = 2;
  let orientation = 1;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    // APP1：Exif 的方向（5–8 表示顯示時寬高對調）。
    if (marker === 0xe1 && bytes.toString("latin1", offset + 4, offset + 8) === "Exif") {
      const tiff = offset + 10;
      const little = bytes.toString("latin1", tiff, tiff + 2) === "II";
      const u16 = (at: number) =>
        little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at);
      const u32 = (at: number) =>
        little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
      if (tiff + 8 < bytes.length) {
        const ifd = tiff + u32(tiff + 4);
        const count = ifd + 2 <= bytes.length ? u16(ifd) : 0;
        for (let n = 0; n < count; n += 1) {
          const entry = ifd + 2 + n * 12;
          if (entry + 12 > bytes.length) break;
          if (u16(entry) === 0x0112) orientation = u16(entry + 8);
        }
      }
    }
    // SOF0–SOF15（C4、C8、CC 不是影格標記）。
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      return orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 30) return null;
  const kind = bytes.toString("latin1", 12, 16);
  if (kind === "VP8 ")
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X")
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  return null;
}

/** 從圖片內容判斷寬高；不認得的格式或壞檔回傳 null。 */
export function imageSizeOf(bytes: Buffer): ImageSize | null {
  try {
    let size: ImageSize | null = null;
    if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47)
      size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    else if (bytes.length >= 10 && bytes.toString("latin1", 0, 3) === "GIF")
      size = { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
    else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8)
      size = jpegSize(bytes);
    else if (
      bytes.length >= 16 &&
      bytes.toString("latin1", 0, 4) === "RIFF" &&
      bytes.toString("latin1", 8, 12) === "WEBP"
    )
      size = webpSize(bytes);
    return size && size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null;
  }
}

export function imageSize(file: string): ImageSize | null {
  try {
    return imageSizeOf(fs.readFileSync(file));
  } catch {
    return null;
  }
}
