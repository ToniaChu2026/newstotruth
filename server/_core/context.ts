import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { SessionUser } from "@shared/types";
import { userFromRequest } from "./auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: SessionUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: await userFromRequest(opts.req),
  };
}
