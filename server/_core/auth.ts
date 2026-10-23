import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { SessionUser } from "@shared/types";
import { parse as parseCookieHeader } from "cookie";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

const ADMIN_USER: SessionUser = { name: "管理員", role: "admin" };

function secretKey() {
  if (!ENV.sessionSecret) throw new Error("SESSION_SECRET 尚未設定。");
  return new TextEncoder().encode(ENV.sessionSecret);
}

/** 以固定時間比較密碼，避免透過回應時間猜測。 */
export function passwordMatches(
  candidate: string,
  expected = ENV.adminPassword
) {
  if (!expected) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function signSession(expiresInMs = ONE_YEAR_MS) {
  return new SignJWT({ role: ADMIN_USER.role, name: ADMIN_USER.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
    .sign(secretKey());
}

export async function verifySession(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token || !ENV.sessionSecret) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    return payload.role === "admin" ? ADMIN_USER : null;
  } catch {
    return null;
  }
}

export async function userFromRequest(
  req: Request
): Promise<SessionUser | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return verifySession(cookies[COOKIE_NAME]);
}
