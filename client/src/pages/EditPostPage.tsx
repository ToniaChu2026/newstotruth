import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { WP_CATEGORY_NAMES, type WpCategoryName } from "@shared/const";
import { ArrowLeft, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useParams } from "wouter";

type Form = {
  title: string;
  excerpt: string;
  category: WpCategoryName;
  tags: string;
  image: string;
  body: string;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-stone-800">{label}</span>
      {hint ? (
        <span className="ml-2 text-xs text-stone-400">{hint}</span>
      ) : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function EditPostPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const post = trpc.importer.post.useQuery(
    { id },
    { enabled: Boolean(user), retry: false, refetchOnWindowFocus: false }
  );
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/admin");
  }, [loading, user, navigate]);
  useEffect(() => {
    if (!post.data) return;
    setForm({
      title: post.data.title,
      excerpt: post.data.excerpt,
      category: (WP_CATEGORY_NAMES as readonly string[]).includes(
        post.data.category
      )
        ? (post.data.category as WpCategoryName)
        : "最新",
      tags: post.data.tags.join("、"),
      image: post.data.image ?? "",
      body: post.data.body,
    });
  }, [post.data]);

  const invalidate = () =>
    Promise.all([
      utils.importer.invalidate(),
      utils.site.invalidate(),
    ]);
  const update = trpc.importer.updatePost.useMutation();
  const setStatus = trpc.importer.setStatus.useMutation();
  const remove = trpc.importer.deletePost.useMutation();
  const busy = update.isPending || setStatus.isPending || remove.isPending;

  const save = async (publish?: boolean) => {
    if (!form) return;
    try {
      await update.mutateAsync({
        id,
        title: form.title,
        excerpt: form.excerpt,
        category: form.category,
        tags: form.tags
          .split(/[、,，\n]/)
          .map(tag => tag.trim())
          .filter(Boolean),
        image: form.image.trim(),
        body: form.body,
      });
      if (publish !== undefined)
        await setStatus.mutateAsync({
          id,
          status: publish ? "published" : "draft",
        });
      await invalidate();
      toast.success(
        publish === true
          ? "已發佈到網站。"
          : publish === false
            ? "已撤回為草稿。"
            : "已儲存。"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗。");
    }
  };

  const destroy = async () => {
    if (!window.confirm("確定要刪除這篇文章嗎？刪除後無法復原。")) return;
    try {
      await remove.mutateAsync({ id });
      await invalidate();
      toast.success("文章已刪除。");
      navigate("/admin");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刪除失敗。");
    }
  };

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm(current => (current ? { ...current, [key]: value } : current));
  const published = post.data?.status === "published";

  return (
    <div className="min-h-screen bg-[#f7f5f0]">
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" /> 回到匯入工具
        </Link>
        {post.isError ? (
          <p className="mt-10 text-stone-600">{post.error.message}</p>
        ) : !form || !post.data ? (
          <Skeleton className="mt-8 h-96 w-full" />
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h1 className="font-display text-3xl tracking-[-.03em] text-stone-950">
                  編輯文章
                </h1>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${published ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                >
                  {published ? "已發佈" : "草稿"}
                </span>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={`/post/${id}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {published ? "查看文章" : "預覽"}
                </a>
              </Button>
            </div>

            <div className="mt-6 space-y-5 rounded-2xl border border-stone-200 bg-[#fffdf9] p-5 shadow-sm sm:p-7">
              <Field label="標題">
                <Input
                  value={form.title}
                  onChange={event => set("title", event.target.value)}
                  className="h-11 bg-white text-base"
                />
              </Field>
              <Field label="摘要" hint="顯示在首頁卡片上">
                <Textarea
                  value={form.excerpt}
                  onChange={event => set("excerpt", event.target.value)}
                  rows={3}
                  className="bg-white leading-7"
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
                <Field label="分類">
                  <select
                    value={form.category}
                    onChange={event =>
                      set("category", event.target.value as WpCategoryName)
                    }
                    className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm"
                  >
                    {WP_CATEGORY_NAMES.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="標籤" hint="用頓號或逗號分隔">
                  <Input
                    value={form.tags}
                    onChange={event => set("tags", event.target.value)}
                    className="h-11 bg-white"
                  />
                </Field>
              </div>
              <Field label="首圖網址" hint="留空表示沒有首圖">
                <div className="flex items-center gap-3">
                  {form.image ? (
                    <img
                      src={form.image}
                      alt=""
                      className="h-11 w-16 shrink-0 rounded border border-stone-200 object-cover"
                    />
                  ) : null}
                  <Input
                    value={form.image}
                    onChange={event => set("image", event.target.value)}
                    placeholder="/media/… 或 https://…"
                    className="h-11 bg-white"
                  />
                </div>
              </Field>
              <Field
                label="正文"
                hint="每段之間空一行；圖片寫成 ![說明](圖片網址)"
              >
                <Textarea
                  value={form.body}
                  onChange={event => set("body", event.target.value)}
                  rows={22}
                  className="bg-white text-[15px] leading-8"
                />
              </Field>
              {post.data.sourceUrl ? (
                <p className="break-all text-xs text-stone-400">
                  來源：{post.data.sourceUrl}
                </p>
              ) : null}
            </div>

            <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-[#f7f5f0]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
              {published ? (
                <>
                  <Button
                    disabled={busy}
                    onClick={() => save()}
                    className="bg-stone-950 text-white hover:bg-stone-800"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    儲存變更
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => save(false)}
                  >
                    撤回為草稿
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    disabled={busy}
                    onClick={() => save(true)}
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    儲存並發佈
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => save()}
                  >
                    儲存草稿
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={destroy}
                className="ml-auto gap-2 text-red-700 hover:bg-red-50 hover:text-red-800"
              >
                <Trash2 className="h-4 w-4" /> 刪除
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
