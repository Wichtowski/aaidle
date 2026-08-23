import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient, isApiUnavailable, type AuthUser } from "@lib/api/client";
import { AuthContext, type AuthContextValue } from "./auth-context";

type AuthState = {
  hardcoreUnlocked: boolean;
  loading: boolean;
  unavailable: boolean;
  user: AuthUser | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<AuthState>({
    hardcoreUnlocked: false,
    loading: true,
    unavailable: false,
    user: null,
  });

  const refreshHardcoreAccess = useCallback(async () => {
    const status = await apiClient.hardcoreStatus();
    setState((current) => ({
      ...current,
      hardcoreUnlocked: Boolean(current.user && status.signedIn && status.unlocked),
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const user = await apiClient.currentUser();
        if (cancelled) return;
        setState({ hardcoreUnlocked: false, loading: false, unavailable: false, user });
        if (!user || user.disabled) return;

        try {
          const status = await apiClient.hardcoreStatus();
          if (!cancelled) {
            setState((current) => ({
              ...current,
              hardcoreUnlocked: Boolean(current.user && status.signedIn && status.unlocked),
            }));
          }
        } catch {
          // Access remains locked until the server can confirm the entitlement
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            hardcoreUnlocked: false,
            loading: false,
            unavailable: isApiUnavailable(error),
            user: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const setAuthenticatedUser = useCallback((user: AuthUser | null) => {
    setState({ hardcoreUnlocked: false, loading: false, unavailable: false, user });
    if (!user || user.disabled) return;

    void apiClient.hardcoreStatus().then((status) => {
      setState((current) =>
        current.user?.id === user.id
          ? { ...current, hardcoreUnlocked: status.signedIn && status.unlocked }
          : current,
      );
    });
  }, []);

  const retry = useCallback(() => {
    setState((current) => ({ ...current, hardcoreUnlocked: false, loading: true, unavailable: false }));
    setRetryKey((current) => current + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      hardcoreUnlocked: state.hardcoreUnlocked,
      loading: state.loading,
      refreshHardcoreAccess,
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
    [refreshHardcoreAccess, retry, setAuthenticatedUser, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
