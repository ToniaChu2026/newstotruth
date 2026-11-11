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

export type SiteBlock =
  | { type: "p"; text: string }
  | { type: "img"; url: string; alt: string; caption?: string };

export type SitePostStatus = "draft" | "published";

export type SitePost = {
  id: number;
  title: string;
  excerpt: string;
  blocks: SiteBlock[];
  category: string;
  tags: string[];
  /** 首圖網址（/media/… 或 https://…），沒有則為 null。 */
  image: string | null;
  sourceUrl: string | null;
  status: SitePostStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type SitePostSummary = Omit<SitePost, "blocks">;
