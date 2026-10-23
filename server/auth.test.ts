import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-with-enough-length";
  process.env.ADMIN_PASSWORD = "correct horse";
});

describe("登入與工作階段", () => {
  it("密碼比對只接受完全相同的值", async () => {
    const { passwordMatches } = await import("./_core/auth");
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("correct horse!", "correct horse")).toBe(false);
    expect(passwordMatches("", "")).toBe(false);
  });

  it("簽發的工作階段可以驗證，竄改後失效", async () => {
    const { signSession, verifySession } = await import("./_core/auth");
    const token = await signSession();
    expect(await verifySession(token)).toEqual({
      name: "管理員",
      role: "admin",
    });
    expect(await verifySession(`${token}x`)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("未登入時匯入相關程序回傳 UNAUTHORIZED", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      req: {} as never,
      res: {} as never,
      user: null,
    });
    await expect(
      caller.importer.start({ url: "https://publisher.example.com/story" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.importer.jobs()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("密碼錯誤時登入失敗", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      req: {} as never,
      res: {} as never,
      user: null,
    });
    await expect(caller.auth.login({ password: "wrong" })).rejects.toThrow(
      /密碼不正確/
    );
  });
});
