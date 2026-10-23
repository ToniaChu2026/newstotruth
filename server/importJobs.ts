import type { ImportStage } from "@shared/const";
import type { ImportJob } from "@shared/types";
import { randomUUID } from "node:crypto";
import { importToWordPress, type ImportDeps } from "./articleImport";

const MAX_JOBS = 50;
const jobs = new Map<string, ImportJob>();

function touch(job: ImportJob) {
  job.updatedAt = new Date();
  return job;
}

function trim() {
  if (jobs.size <= MAX_JOBS) return;
  const oldest = Array.from(jobs.values()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  for (const job of oldest.slice(0, jobs.size - MAX_JOBS)) {
    if (job.status === "succeeded" || job.status === "failed")
      jobs.delete(job.id);
  }
}

export function getJob(id: string) {
  return jobs.get(id) ?? null;
}

export function listJobs() {
  return Array.from(jobs.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function activeJobForUrl(url: string) {
  return (
    listJobs().find(
      job =>
        job.url === url && (job.status === "queued" || job.status === "running")
    ) ?? null
  );
}

export type JobRunner = (
  url: string,
  deps: ImportDeps
) => ReturnType<typeof importToWordPress>;

/** 建立並在背景執行匯入工作；前端以 jobId 輪詢進度。 */
export function startImportJob(
  url: string,
  runner: JobRunner = importToWordPress,
  deps: ImportDeps = {}
) {
  const existing = activeJobForUrl(url);
  if (existing) return existing;
  const now = new Date();
  const job: ImportJob = {
    id: randomUUID(),
    url,
    status: "queued",
    stage: null,
    completedStages: [],
    message: null,
    error: null,
    result: null,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  trim();

  const onProgress = (stage: ImportStage, message?: string) => {
    if (
      job.stage &&
      job.stage !== stage &&
      !job.completedStages.includes(job.stage)
    )
      job.completedStages.push(job.stage);
    job.stage = stage;
    job.message = message ?? null;
    touch(job);
  };

  job.status = "running";
  runner(url, { ...deps, onProgress })
    .then(result => {
      if (job.stage && !job.completedStages.includes(job.stage))
        job.completedStages.push(job.stage);
      job.result = result;
      job.status = "succeeded";
      job.message = result.duplicate
        ? "這個網址先前已匯入過，直接開啟既有文章。"
        : "草稿已建立。";
      touch(job);
    })
    .catch(error => {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      touch(job);
    });
  return job;
}

export function resetJobsForTests() {
  jobs.clear();
}
