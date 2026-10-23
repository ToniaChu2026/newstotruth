import { trpc } from "@/lib/trpc";

export function useAuth() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const login = trpc.auth.login.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
      utils.invalidate();
    },
  });
  return { user: me.data ?? null, loading: me.isLoading, login, logout };
}
