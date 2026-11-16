import { describe, expect, it } from "vitest";
import { imageSizeOf } from "./image-size";

const hex = (value: string) => Buffer.from(value.replace(/\s+/g, ""), "hex");

describe("讀取圖片寬高", () => {
  it("PNG、GIF", () => {
    const png = Buffer.alloc(32);
    hex("89504e470d0a1a0a0000000d49484452").copy(png);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(imageSizeOf(png)).toEqual({ width: 640, height: 480 });
    const gif = Buffer.alloc(16);
    gif.write("GIF89a", "latin1");
    gif.writeUInt16LE(300, 6);
    gif.writeUInt16LE(250, 8);
    expect(imageSizeOf(gif)).toEqual({ width: 300, height: 250 });
  });

  it("JPEG：跳過 APP 區段找到影格，Exif 方向 6 時寬高對調", () => {
    const sof = hex("ffc0 0011 08 0320 04b0 03 012200 021101 031101"); // 高 800、寬 1200
    const app0 = hex("ffe0 0010 4a46494600 0101 00 0048 0048 0000");
    const plain = Buffer.concat([hex("ffd8"), app0, sof, Buffer.alloc(8)]);
    expect(imageSizeOf(plain)).toEqual({ width: 1200, height: 800 });
    // Exif：大端序，IFD0 只有一筆 Orientation(0x0112)=6
    const exif = hex(
      "ffe1 0022 457869660000 4d4d002a 00000008 0001 0112 0003 00000001 0006 0000 00000000"
    );
    const rotated = Buffer.concat([hex("ffd8"), exif, sof, Buffer.alloc(8)]);
    expect(imageSizeOf(rotated)).toEqual({ width: 800, height: 1200 });
  });

  it("WebP 的三種格式", () => {
    const riff = (kind: string) => {
      const bytes = Buffer.alloc(40);
      bytes.write("RIFF", 0, "latin1");
      bytes.write("WEBP", 8, "latin1");
      bytes.write(kind, 12, "latin1");
      return bytes;
    };
    const lossy = riff("VP8 ");
    lossy.writeUInt16LE(600, 26);
    lossy.writeUInt16LE(337, 28);
    expect(imageSizeOf(lossy)).toEqual({ width: 600, height: 337 });
    const lossless = riff("VP8L");
    lossless.writeUInt32LE((400 - 1) | ((333 - 1) << 14), 21);
    expect(imageSizeOf(lossless)).toEqual({ width: 400, height: 333 });
    const extended = riff("VP8X");
    extended.writeUIntLE(1600 - 1, 24, 3);
    extended.writeUIntLE(905 - 1, 27, 3);
    expect(imageSizeOf(extended)).toEqual({ width: 1600, height: 905 });
  });

  it("不是圖片或檔案損壞時回傳 null", () => {
    expect(imageSizeOf(Buffer.alloc(9000, 1))).toBeNull();
    expect(imageSizeOf(Buffer.from("<html>"))).toBeNull();
    expect(imageSizeOf(hex("ffd8ffe0"))).toBeNull();
  });
});
