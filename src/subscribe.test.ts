import { describe, expect, it } from "vitest";
import { onRequestPost, type D1Database } from "../functions/api/subscribe";

function fakeDb() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db: D1Database = {
    prepare(sql) {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          statement.values = values;
          return statement;
        },
        async run() {
          calls.push({ sql, values: statement.values });
          return {};
        },
      };
      return statement;
    },
  };
  return { db, calls };
}

const post = (body: unknown) =>
  new Request("https://news-focus.org/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("下載表單的電子郵件", () => {
  it("存進 D1：郵件轉小寫，同一個郵件再次提交只更新次數", async () => {
    const { db, calls } = fakeDb();
    const response = await onRequestPost({
      request: post({ email: " Reader@Example.COM ", page: "/new-page/" }),
      env: { DB: db },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, stored: true });
    expect(calls[0].sql).toContain("CREATE TABLE IF NOT EXISTS subscribers");
    expect(calls[1].sql).toContain("ON CONFLICT(email) DO UPDATE");
    expect(calls[1].values[0]).toBe("reader@example.com");
    expect(calls[1].values[2]).toBe("/new-page/");
  });

  it("郵件格式不對回 400，不寫入", async () => {
    const { db, calls } = fakeDb();
    for (const body of [{ email: "not-an-email" }, "{bad json"]) {
      const response = await onRequestPost({
        request: post(body),
        env: { DB: db },
      });
      expect(response.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("防機器人欄位有填就不存；沒綁資料庫或寫入失敗時仍回成功", async () => {
    const { db, calls } = fakeDb();
    const bot = await onRequestPost({
      request: post({ email: "a@b.co", website: "spam" }),
      env: { DB: db },
    });
    expect(await bot.json()).toEqual({ ok: true, stored: false });
    expect(calls).toHaveLength(0);

    const noDb = await onRequestPost({
      request: post({ email: "a@b.co" }),
      env: {},
    });
    expect(await noDb.json()).toEqual({
      ok: true,
      stored: false,
      reason: "no database binding",
    });

    const broken: D1Database = {
      prepare: () => ({
        bind() {
          return this;
        },
        run: () => Promise.reject(new Error("down")),
      }),
    };
    const failed = await onRequestPost({
      request: post({ email: "a@b.co" }),
      env: { DB: broken },
    });
    expect(failed.status).toBe(200);
    expect(await failed.json()).toEqual({
      ok: true,
      stored: false,
      reason: "database error",
    });
  });
});
