import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient, isApiUnavailable, type AuthUser } from "@lib/api/client";
import { AuthContext, type AuthContextValue } from "./auth-context";

type AuthState = {
  loading: boolean;
  unavailable: boolean;
  user: AuthUser | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<AuthState>({ loading: true, unavailable: false, user: null });

  useEffect(() => {
    let cancelled = false;

    void apiClient
      .currentUser()
      .then((user) => {
        if (!cancelled) setState({ loading: false, unavailable: false, user });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ loading: false, unavailable: isApiUnavailable(error), user: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const setAuthenticatedUser = useCallback((user: AuthUser | null) => {
    setState({ loading: false, unavailable: false, user });
  }, []);

  const retry = useCallback(() => {
    setState((current) => ({ ...current, loading: true, unavailable: false }));
    setRetryKey((current) => current + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: state.loading,
      unavailable: state.unavailable,
      user: state.user,
      setAuthenticatedUser,
      signOut: async () => {
        await apiClient.signOut();
        setAuthenticatedUser(null);
        window.location.assign("/");
      },
      retry,
    }),
    [retry, setAuthenticatedUser, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
