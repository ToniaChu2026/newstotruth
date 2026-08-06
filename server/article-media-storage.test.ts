import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "news/articles/9/image.jpg", url: "/manus-storage/news/articles/9/image.jpg" }),
}));

import { downloadAndStoreImage } from "./articleImport";
import { storagePut } from "./storage";

describe("S3 image persistence", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uploads a verified raster response to persistent storage and returns its stable reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg", "content-length": "4" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }));

    const stored = await downloadAndStoreImage({ url: "https://cdn.example.com/photo.jpg", altText: "Photo", index: 0 }, 9);

    expect(storagePut).toHaveBeenCalledWith(expect.stringMatching(/^news\/articles\/9\/.+\.jpg$/), expect.any(Buffer), "image/jpeg");
    expect(stored).toEqual({ storageKey: "news/articles/9/image.jpg", storageUrl: "/manus-storage/news/articles/9/image.jpg" });
  });
});
