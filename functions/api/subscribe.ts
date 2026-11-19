/**
 * Cloudflare Pages Function：POST /api/subscribe
 * 下載表單送來的電子郵件存進 D1 資料庫（Pages 專案設定裡綁定為 DB）的 subscribers 表。
 * 同一個郵件再次提交時只更新 last_seen 與 count。
 * 回應 { ok: true, stored }（沒存時附 reason，方便檢查設定）；郵件格式不對回 400。沒綁定資料庫或寫入失敗時仍回 200，
 * 讓讀者照樣拿到下載連結（錯誤記在 Cloudflare 的 Functions 記錄裡）。
 */

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
};
export type D1Database = { prepare(sql: string): D1Statement };
export type Env = { DB?: D1Database };

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

const CREATE = `CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  page TEXT
)`;

const UPSERT = `INSERT INTO subscribers (email, first_seen, last_seen, count, page)
VALUES (?1, ?2, ?2, 1, ?3)
ON CONFLICT(email) DO UPDATE SET last_seen = ?2, count = count + 1`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (email.length > 254 || !EMAIL.test(email))
    return json({ ok: false, error: "invalid email" }, 400);
  // 防機器人欄位：真人看不到，填了就假裝成功、不存。
  if (String(body.website ?? "")) return json({ ok: true, stored: false });
  const page = String(body.page ?? "").slice(0, 200) || null;

  if (!env.DB) {
    console.error("subscribe: D1 binding DB is missing");
    return json({ ok: true, stored: false, reason: "no database binding" });
  }
  try {
    await env.DB.prepare(CREATE).run();
    await env.DB.prepare(UPSERT)
      .bind(email, new Date().toISOString(), page)
      .run();
    return json({ ok: true, stored: true });
  } catch (error) {
    console.error("subscribe: D1 write failed", error);
    return json({ ok: true, stored: false, reason: "database error" });
  }
}
