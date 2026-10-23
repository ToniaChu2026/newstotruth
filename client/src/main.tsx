import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

// 任何查詢回傳「請先登入」時，清掉登入狀態讓畫面回到登入框。
queryClient.getQueryCache().subscribe(event => {
  if (event.type !== "updated" || event.action.type !== "error") return;
  const error = event.query.state.error;
  if (error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG)
    queryClient.setQueryData([["auth", "me"], { type: "query" }], null);
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: (input, init) =>
        globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
