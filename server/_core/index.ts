import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { createServer } from "http";
import net from "net";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { missingEnv } from "./env";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const missing = missingEnv();
  if (missing.length)
    console.warn(
      `[設定] 尚未設定：${missing.join(", ")}。請參考 .env.example。`
    );

  const app = express();
  const server = createServer(app);
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort)
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () =>
    console.log(`AI 匯入工具：http://localhost:${port}/`)
  );
}

startServer().catch(console.error);
