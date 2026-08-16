import { useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, isApiUnavailable } from "@lib/api/client";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const currentUser = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiClient.currentUser(),
    retry: 1,
    staleTime: 60_000,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: currentUser.isPending,
      unavailable: currentUser.isError && isApiUnavailable(currentUser.error),
      user: currentUser.data ?? null,
      setAuthenticatedUser: (user) => queryClient.setQueryData(["auth", "me"], user),
      signOut: async () => {
        await apiClient.signOut();
        queryClient.setQueryData(["auth", "me"], null);
        window.location.assign("/");
      },
      retry: () => void currentUser.refetch(),
    }),
    [currentUser.data, currentUser.error, currentUser.isError, currentUser.isPending, currentUser.refetch, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
