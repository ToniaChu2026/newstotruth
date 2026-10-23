import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  IMPORT_STAGES,
  IMPORT_STAGE_LABELS,
  type ImportStage,
} from "@shared/const";
import type { ImportJob } from "@shared/types";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function ImportPage() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Shell>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Shell>
    );
  }
  return <Shell>{user ? <Workspace /> : <LoginCard />}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f5f0]">
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}

function LoginCard() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate(
      { password },
      { onError: error => toast.error(error.message) }
    );
  };
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-stone-200 bg-[#fffdf9] p-8 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-950 text-xs font-bold tracking-[.16em] text-white">
        N
      </span>
      <h1 className="mt-6 font-display text-3xl tracking-[-.03em] text-stone-950">
        AI 匯入工具
      </h1>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        輸入管理密碼後，貼上文章網址即可自動建立 WordPress 草稿。
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <Input
          type="password"
          autoFocus
          required
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="管理密碼"
          className="h-11 bg-white"
        />
        <Button
          type="submit"
          disabled={login.isPending}
          className="h-11 w-full bg-stone-950 text-white hover:bg-stone-800"
        >
          {login.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "登入"
          )}
        </Button>
      </form>
    </div>
  );
}

function Workspace() {
  const { logout } = useAuth();
  const settings = trpc.importer.settings.useQuery();
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const start = trpc.importer.start.useMutation({
    onSuccess: job => {
      setJobId(job.id);
      utils.importer.jobs.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    start.mutate({ url: trimmed });
  };

  return (
    <>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-amber-700">
            新闻聚焦 · newstotruth.com
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-[-.04em] text-stone-950 sm:text-5xl">
            AI 匯入工具
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-stone-500">
            貼上一篇已授權文章的網址。工具會抓取內容、用 AI
            整理成簡體中文、上傳圖片，然後在 WordPress 建立<strong>草稿</strong>
            。發佈仍在 WordPress 後台操作。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => logout.mutate()}
          className="gap-2 self-start sm:self-auto"
        >
          <LogOut className="h-3.5 w-3.5" /> 登出
        </Button>
      </header>

      <section className="mt-8 rounded-2xl border border-amber-200 bg-[#fffaf0] p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <Link2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-2xl tracking-[-.03em] text-stone-950">
              匯入文章
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              只匯入你有轉載授權的來源。AI 會自動挑分類（
              {settings.data?.categories
                .map(category => category.name)
                .join("、") ?? "…"}
              ），拿不準時用「最新」。
            </p>
          </div>
        </div>
        <form
          onSubmit={submit}
          className="mt-5 flex flex-col gap-3 sm:flex-row"
        >
          <Input
            type="url"
            required
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder="https://www.example.com/article"
            className="h-11 bg-white"
          />
          <Button
            type="submit"
            disabled={start.isPending}
            className="h-11 shrink-0 gap-2 bg-stone-950 text-white hover:bg-stone-800"
          >
            {start.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 送出中…
              </>
            ) : (
              "建立草稿"
            )}
          </Button>
        </form>
        {settings.data ? (
          <p className="mt-3 text-xs text-stone-400">
            目標網站 {settings.data.wpBaseUrl} · 模型 {settings.data.model}
          </p>
        ) : null}
      </section>

      {jobId ? (
        <JobPanel
          jobId={jobId}
          onDone={() => {
            utils.importer.recentPosts.invalidate();
            setUrl("");
          }}
        />
      ) : null}

      <RecentPosts />
    </>
  );
}

function JobPanel({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const job = trpc.importer.job.useQuery(
    { id: jobId },
    {
      refetchInterval: query => {
        const status = query.state.data?.status;
        return status === "succeeded" || status === "failed" ? false : 1000;
      },
    }
  );
  const status = job.data?.status;
  useEffect(() => {
    if (status === "succeeded") onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!job.data)
    return (
      <section className="mt-6 rounded-2xl border border-stone-200 bg-[#fffdf9] p-6">
        <Skeleton className="h-6 w-48" />
      </section>
    );
  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-[#fffdf9] p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl tracking-[-.03em] text-stone-950">
          匯入進度
        </h2>
        <StatusBadge job={job.data} />
      </div>
      <p className="mt-1 truncate text-xs text-stone-400">{job.data.url}</p>
      <StageList job={job.data} />
      {job.data.status === "failed" ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">匯入失敗</p>
            <p className="mt-1 leading-6">{job.data.error}</p>
          </div>
        </div>
      ) : null}
      {job.data.result ? <ResultCard job={job.data} /> : null}
    </section>
  );
}

function StatusBadge({ job }: { job: ImportJob }) {
  if (job.status === "succeeded")
    return (
      <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        完成
      </Badge>
    );
  if (job.status === "failed")
    return (
      <Badge className="rounded-full bg-red-100 text-red-800 hover:bg-red-100">
        失敗
      </Badge>
    );
  return (
    <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
      處理中
    </Badge>
  );
}

function StageList({ job }: { job: ImportJob }) {
  const stageState = (stage: ImportStage): "done" | "active" | "pending" => {
    if (job.completedStages.includes(stage) || job.status === "succeeded")
      return "done";
    if (job.stage === stage && job.status === "running") return "active";
    return "pending";
  };
  return (
    <ol className="mt-5 grid gap-3 sm:grid-cols-4">
      {IMPORT_STAGES.map(stage => {
        const state = stageState(stage);
        return (
          <li
            key={stage}
            className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${state === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : state === "active" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-stone-200 bg-white text-stone-400"}`}
          >
            {state === "done" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : state === "active" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Circle className="h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{IMPORT_STAGE_LABELS[stage]}</p>
              {state === "active" && job.message ? (
                <p className="truncate text-xs opacity-80">{job.message}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ResultCard({ job }: { job: ImportJob }) {
  const result = job.result!;
  return (
    <div className="mt-5 rounded-xl border border-stone-200 bg-white p-5">
      {result.duplicate ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          這個網址先前已匯入過，以下是既有文章。
        </p>
      ) : null}
      <p className="font-display text-xl tracking-[-.02em] text-stone-950">
        {result.title}
      </p>
      {!result.duplicate ? (
        <dl className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-stone-400">分類</dt>
            <dd>{result.category}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-400">標籤</dt>
            <dd>{result.tags.length ? result.tags.join("、") : "無"}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-400">圖片</dt>
            <dd>
              已上傳 {result.imageCount} 張
              {result.skippedImages ? `，略過 ${result.skippedImages} 張` : ""}
            </dd>
          </div>
        </dl>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          asChild
          className="gap-2 bg-stone-950 text-white hover:bg-stone-800"
        >
          <a href={result.editUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> 在 WordPress 開啟草稿
          </a>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <a href={result.previewUrl} target="_blank" rel="noreferrer">
            預覽
          </a>
        </Button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending: "待審",
  publish: "已發佈",
  private: "私密",
  future: "排程",
};

function RecentPosts() {
  const posts = trpc.importer.recentPosts.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-[#fffdf9]">
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
        <h2 className="font-display text-xl tracking-[-.03em] text-stone-950">
          最近由工具建立的文章
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => posts.refetch()}
          className="gap-2 text-stone-500"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${posts.isFetching ? "animate-spin" : ""}`}
          />{" "}
          重新整理
        </Button>
      </div>
      {posts.isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : posts.isError ? (
        <div className="p-8 text-center text-sm text-stone-500">
          <AlertCircle className="mx-auto mb-2 h-5 w-5 text-stone-400" />
          無法讀取 WordPress 文章：{posts.error.message}
        </div>
      ) : posts.data?.length ? (
        <ul className="divide-y divide-stone-100">
          {posts.data.map(post => (
            <li
              key={post.id}
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  >
                    {STATUS_LABEL[post.status] ?? post.status}
                  </Badge>
                  <span className="text-[11px] text-stone-400">
                    {post.categories.join("、") || "未分類"}
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {new Date(post.modified).toLocaleString("zh-TW")}
                  </span>
                </div>
                <p className="truncate font-display text-lg tracking-[-.02em] text-stone-950">
                  {post.title || "（無標題）"}
                </p>
                {post.sourceUrl ? (
                  <p className="truncate text-xs text-stone-400">
                    {post.sourceUrl}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={post.editUrl} target="_blank" rel="noreferrer">
                    編輯
                  </a>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={post.previewUrl} target="_blank" rel="noreferrer">
                    預覽
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-8 text-center text-sm text-stone-500">
          還沒有由這個帳號建立的文章。
        </p>
      )}
    </section>
  );
}
