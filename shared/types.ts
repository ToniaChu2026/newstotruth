export * from "./_core/errors";

export type SessionUser = { name: string; role: "admin" };

export type ImportJobStatus = "queued" | "running" | "succeeded" | "failed";

export type ImportJobResult = {
  postId: number;
  editUrl: string;
  previewUrl: string;
  title: string;
  category: string;
  tags: string[];
  imageCount: number;
  skippedImages: number;
  duplicate: boolean;
};

export type ImportJob = {
  id: string;
  url: string;
  status: ImportJobStatus;
  stage: import("./const").ImportStage | null;
  completedStages: import("./const").ImportStage[];
  message: string | null;
  error: string | null;
  result: ImportJobResult | null;
  createdAt: Date;
  updatedAt: Date;
};
