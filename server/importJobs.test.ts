import { beforeEach, describe, expect, it } from "vitest";
import { getJob, resetJobsForTests, startImportJob } from "./importJobs";

const result = {
  postId: 1,
  editUrl: "e",
  previewUrl: "p",
  title: "t",
  category: "最新",
  tags: [],
  imageCount: 0,
  skippedImages: 0,
  duplicate: false,
};

describe("匯入工作", () => {
  beforeEach(() => resetJobsForTests());

  it("記錄進度與結果", async () => {
    const job = startImportJob("https://a.example/1", async (_url, deps) => {
      deps.onProgress?.("fetch");
      deps.onProgress?.("structure");
      deps.onProgress?.("draft", "建立中");
      return result;
    });
    expect(job.status).toBe("running");
    await new Promise(resolve => setTimeout(resolve, 5));
    const done = getJob(job.id)!;
    expect(done.status).toBe("succeeded");
    expect(done.completedStages).toEqual(["fetch", "structure", "draft"]);
    expect(done.result).toEqual(result);
  });

  it("失敗時保留錯誤訊息", async () => {
    const job = startImportJob("https://a.example/2", async () => {
      throw new Error("爆了");
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(getJob(job.id)!.status).toBe("failed");
    expect(getJob(job.id)!.error).toBe("爆了");
  });

  it("同一網址進行中不重複建立工作", () => {
    const runner = () => new Promise<typeof result>(() => {});
    const first = startImportJob("https://a.example/3", runner);
    const second = startImportJob("https://a.example/3", runner);
    expect(second.id).toBe(first.id);
  });
});
