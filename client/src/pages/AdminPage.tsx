import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CircleAlert, FilePenLine, Link2, Loader2, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Status = "draft" | "pending review" | "published";
type ArticleForm = {
  title: string;
  summary: string;
  content: string;
  status: Status;
  sourceUrl: string;
  categoryName: string;
  tagNames: string;
};

const blankForm: ArticleForm = { title: "", summary: "", content: "", status: "draft", sourceUrl: "", categoryName: "", tagNames: "" };
const statusOptions: Array<Status | "all"> = ["all", "draft", "pending review", "published"];

function formatDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "Not published";
}

function statusClass(status: Status) {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending review") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-stone-200 bg-stone-100 text-stone-600";
}

export default function AdminPage() {
  return <DashboardLayout><EditorialDesk /></DashboardLayout>;
}

function EditorialDesk() {
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [form, setForm] = useState<ArticleForm>(blankForm);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const utils = trpc.useUtils();
  const list = trpc.admin.listArticles.useQuery(filter === "all" ? {} : { status: filter });
  const allArticles = trpc.admin.listArticles.useQuery({});
  const article = trpc.admin.articleById.useQuery({ id: selectedId ?? -1 }, { enabled: Boolean(selectedId) });
  const save = trpc.admin.updateArticle.useMutation({
    onSuccess: data => {
      toast.success("Article saved");
      setSelectedId(data.id);
      utils.admin.listArticles.invalidate();
      utils.admin.articleById.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.admin.deleteArticle.useMutation({
    onSuccess: () => {
      toast.success("Article deleted");
      setSelectedId(null);
      setForm(blankForm);
      utils.admin.listArticles.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const importer = trpc.admin.importArticle.useMutation({
    onSuccess: data => {
      toast.success("Article imported as draft");
      setFilter("draft");
      setSelectedId(data.id);
      setImportUrl("");
      setImportOpen(false);
      utils.admin.listArticles.invalidate();
      utils.admin.articleById.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!article.data) return;
    setForm({
      title: article.data.title,
      summary: article.data.summary,
      content: article.data.content,
      status: article.data.status,
      sourceUrl: article.data.sourceUrl,
      categoryName: article.data.category?.name ?? "",
      tagNames: article.data.tags.map(tag => tag.name).join(", "),
    });
    setView("edit");
  }, [article.data]);

  const counts = useMemo(() => ({
    draft: allArticles.data?.filter(item => item.status === "draft").length ?? 0,
    "pending review": allArticles.data?.filter(item => item.status === "pending review").length ?? 0,
    published: allArticles.data?.filter(item => item.status === "published").length ?? 0,
  }), [allArticles.data]);
  const updateForm = (key: keyof ArticleForm, value: string) => setForm(current => ({ ...current, [key]: value }));
  const payload = () => ({ ...form, tagNames: form.tagNames.split(",").map(tag => tag.trim()).filter(Boolean) });
  const submit = (status?: Status) => {
    if (!selectedId) return;
    save.mutate({ id: selectedId, article: { ...payload(), status: status ?? form.status } });
  };
  const beginImport = (event: React.FormEvent) => {
    event.preventDefault();
    importer.mutate({ url: importUrl.trim() });
  };

  return (
    <div className="mx-auto max-w-[1450px]">
      <header className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-amber-700">Newsroom administration</p>
          <h1 className="mt-3 font-display text-5xl tracking-[-.055em] text-stone-950">Editorial desk</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-stone-500">Review drafts, refine the story, and publish when it is ready for the public newsroom.</p>
        </div>
        <Button onClick={() => setImportOpen(current => !current)} className="gap-2 bg-stone-950 text-white hover:bg-stone-800"><Plus className="h-4 w-4" /> Import article URL</Button>
      </header>

      {importOpen && (
        <section className="mb-7 rounded-xl border border-amber-200 bg-[#fffaf0] p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800"><Link2 className="h-4 w-4" /></span><div><h2 className="font-display text-2xl tracking-[-.035em] text-stone-950">Import an authorized article</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">Paste a URL that you own, license, syndicate, or may legally republish. The server extracts the article, downloads eligible images into S3, and creates a <strong>draft</strong> automatically.</p></div></div>
          <form onSubmit={beginImport} className="mt-5 flex flex-col gap-3 sm:flex-row"><Input type="url" required value={importUrl} onChange={event => setImportUrl(event.target.value)} placeholder="https://your-authorized-source.example/article" className="h-11 bg-white" /><Button type="submit" disabled={importer.isPending} className="h-11 shrink-0 gap-2 bg-stone-950 text-white hover:bg-stone-800">{importer.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : "Create draft"}</Button></form>
        </section>
      )}

      <section className="mb-7 grid gap-3 sm:grid-cols-3">
        {(["draft", "pending review", "published"] as Status[]).map(status => (
          <button onClick={() => setFilter(status)} key={status} className={`rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 ${filter === status ? "border-stone-900 bg-stone-900 text-white shadow-sm" : "border-stone-200 bg-[#fffdf9] text-stone-900 hover:border-stone-300"}`}>
            <p className="text-[10px] font-bold uppercase tracking-[.15em] opacity-60">{status}</p><p className="mt-2 font-display text-3xl tracking-[-.04em]">{counts[status]}</p>
          </button>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(430px,.88fr)]">
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-[#fffdf9]">
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><div className="flex gap-2 overflow-x-auto scrollbar-none">{statusOptions.map(status => <button key={status} onClick={() => setFilter(status)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${filter === status ? "bg-stone-950 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-950"}`}>{status}</button>)}</div><span className="ml-3 hidden shrink-0 text-xs text-stone-400 sm:block">{list.data?.length ?? 0} items</span></div>
          {list.isLoading ? <div className="space-y-4 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div> : list.isError ? <div className="p-12 text-center"><CircleAlert className="mx-auto h-6 w-6 text-stone-400" /><p className="mt-3 text-sm text-stone-500">Unable to load articles.</p><Button variant="outline" size="sm" className="mt-4" onClick={() => list.refetch()}>Retry</Button></div> : list.data?.length ? <div className="divide-y divide-stone-100">{list.data.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors ${selectedId === item.id ? "bg-[#f4efe5]" : "hover:bg-stone-50"}`}><div className="h-14 w-16 shrink-0 overflow-hidden rounded-md bg-stone-100">{item.coverImage ? <img src={item.coverImage.storageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><FilePenLine className="h-4 w-4 text-stone-400" /></div>}</div><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-2"><Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(item.status)}`}>{item.status}</Badge><span className="truncate text-[11px] text-stone-400">{item.category?.name ?? "Uncategorized"}</span></div><p className="truncate font-display text-xl tracking-[-.03em] text-stone-950">{item.title}</p><p className="mt-1 text-xs text-stone-500">Updated {formatDate(item.updatedAt)}</p></div><Pencil className="h-4 w-4 shrink-0 text-stone-400" /></button>)}</div> : <div className="px-6 py-16 text-center"><FilePenLine className="mx-auto h-7 w-7 text-stone-300" /><p className="mt-4 font-display text-2xl text-stone-800">{filter === "all" ? "No articles." : `No ${filter} articles.`}</p><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-stone-500">Import an authorized article URL to begin the editorial review process.</p></div>}
        </section>

        <section className="min-h-[600px] rounded-xl border border-stone-200 bg-[#fffdf9]">
          {!selectedId ? <div className="flex min-h-[600px] flex-col items-center justify-center px-8 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100"><Pencil className="h-5 w-5 text-stone-500" /></span><h2 className="mt-5 font-display text-3xl tracking-[-.04em] text-stone-900">Select an article.</h2><p className="mt-3 max-w-xs text-sm leading-6 text-stone-500">Choose an imported story to review, update its status, or publish it.</p></div> : article.isLoading ? <div className="space-y-4 p-6"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-20 w-full" /><Skeleton className="h-60 w-full" /></div> : article.data ? <ArticleEditor article={article.data} form={form} view={view} onView={setView} onChange={updateForm} onSave={() => submit()} onPublish={() => submit("published")} onDelete={() => { if (window.confirm("Delete this article?")) remove.mutate({ id: selectedId }); }} saving={save.isPending} deleting={remove.isPending} /> : null}
        </section>
      </div>
    </div>
  );
}

function ArticleEditor({ article, form, view, onView, onChange, onSave, onPublish, onDelete, saving, deleting }: { article: any; form: ArticleForm; view: "edit" | "preview"; onView: (view: "edit" | "preview") => void; onChange: (key: keyof ArticleForm, value: string) => void; onSave: () => void; onPublish: () => void; onDelete: () => void; saving: boolean; deleting: boolean }) {
  return <><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1"><button onClick={() => onView("edit")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === "edit" ? "bg-white text-stone-950 shadow-sm" : "text-stone-500"}`}>Edit</button><button onClick={() => onView("preview")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === "preview" ? "bg-white text-stone-950 shadow-sm" : "text-stone-500"}`}>Preview</button></div><Badge variant="outline" className={`rounded-full ${statusClass(article.status)}`}>{article.status}</Badge></div>{view === "edit" ? <form onSubmit={event => { event.preventDefault(); onSave(); }} className="space-y-5 p-5"><div><label className="mb-2 block text-xs font-semibold text-stone-700">Title</label><Input value={form.title} onChange={event => onChange("title", event.target.value)} maxLength={320} /></div><div><label className="mb-2 block text-xs font-semibold text-stone-700">Summary</label><Textarea value={form.summary} onChange={event => onChange("summary", event.target.value)} className="min-h-24 resize-y" /></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-xs font-semibold text-stone-700">Category</label><Input value={form.categoryName} onChange={event => onChange("categoryName", event.target.value)} placeholder="e.g. Culture" /></div><div><label className="mb-2 block text-xs font-semibold text-stone-700">Tags</label><Input value={form.tagNames} onChange={event => onChange("tagNames", event.target.value)} placeholder="Comma separated" /></div></div><div><label className="mb-2 block text-xs font-semibold text-stone-700">Source URL</label><div className="relative"><Link2 className="absolute left-3 top-3 h-4 w-4 text-stone-400" /><Input value={form.sourceUrl} onChange={event => onChange("sourceUrl", event.target.value)} className="pl-9" type="url" /></div></div><div><label className="mb-2 block text-xs font-semibold text-stone-700">Article body</label><Textarea value={form.content} onChange={event => onChange("content", event.target.value)} className="min-h-[245px] resize-y font-serif leading-7" /></div><div><label className="mb-2 block text-xs font-semibold text-stone-700">Status</label><select value={form.status} onChange={event => onChange("status", event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="draft">draft</option><option value="pending review">pending review</option><option value="published">published</option></select></div><div className="flex flex-wrap justify-between gap-3 border-t border-stone-200 pt-5"><Button type="button" variant="ghost" onClick={onDelete} disabled={deleting} className="gap-2 text-destructive hover:bg-red-50 hover:text-destructive"><Trash2 className="h-4 w-4" />Delete</Button><div className="flex gap-2"><Button type="submit" variant="outline" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}</Button><Button type="button" onClick={onPublish} disabled={saving} className="gap-2 bg-stone-950 text-white hover:bg-stone-800"><UploadCloud className="h-4 w-4" />Publish</Button></div></div></form> : <article className="p-6"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-700">{article.category?.name ?? "News"}</p><h2 className="mt-4 font-display text-4xl leading-[.98] tracking-[-.05em] text-stone-950">{form.title}</h2><p className="mt-5 text-base leading-7 text-stone-600">{form.summary}</p><div className="mt-6 flex flex-wrap gap-2">{form.tagNames.split(",").map(tag => tag.trim()).filter(Boolean).map(tag => <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{tag}</span>)}</div><div className="mt-8 border-t border-stone-200 pt-6 font-serif text-lg leading-8 text-stone-700">{form.content.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p className="mb-5" key={index}>{paragraph}</p>)}</div><div className="mt-8 border-t border-stone-200 pt-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-stone-400">Original source</p><p className="mt-2 break-all text-xs text-stone-500">{form.sourceUrl}</p></div></article>}</>;
}
