import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient, isApiUnavailable, type AuthUser } from "@lib/api/client";
import { hellModeActiveKey } from "@lib/storage/local-progress-store";
import { AuthContext, type AuthContextValue } from "./auth-context";

type AuthState = {
  hardcoreUnlocked: boolean;
  hardcoreAccessLoading: boolean;
  loading: boolean;
  unavailable: boolean;
  user: AuthUser | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<AuthState>({
    hardcoreUnlocked: false,
    hardcoreAccessLoading: true,
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

    const checkAuthentication = () => {
      void (async () => {
        try {
          const user = await apiClient.currentUser();
          if (cancelled) return;
          setState({
            hardcoreUnlocked: false,
            hardcoreAccessLoading: Boolean(user && !user.disabled),
            loading: false,
            unavailable: false,
            user,
          });
          if (!user || user.disabled) return;

          try {
            const status = await apiClient.hardcoreStatus();
            if (!cancelled) {
              setState((current) => ({
                ...current,
                hardcoreAccessLoading: false,
                hardcoreUnlocked: Boolean(current.user && status.signedIn && status.unlocked),
              }));
            }
          } catch {
            // Access remains locked until the server can confirm the entitlement
            if (!cancelled) {
              setState((current) => ({ ...current, hardcoreAccessLoading: false }));
            }
          }
        } catch (error) {
          if (!cancelled) {
            setState({
              hardcoreUnlocked: false,
              hardcoreAccessLoading: false,
              loading: false,
              unavailable: isApiUnavailable(error),
              user: null,
            });
          }
        }
      })();
    };

    // Authentication is non-critical for the public shell, so wait until all
    // critical resources have loaded before discovering the current user
    let idleHandle: number | undefined;
    const scheduleAuthentication = () => {
      const hasIdleCallback = typeof window.requestIdleCallback === "function";
      idleHandle = hasIdleCallback
        ? window.requestIdleCallback(checkAuthentication, { timeout: 1_000 })
        : window.setTimeout(checkAuthentication, 0);
    };

    if (document.readyState === "complete") {
      scheduleAuthentication();
    } else {
      window.addEventListener("load", scheduleAuthentication, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleAuthentication);
      if (idleHandle !== undefined) {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleHandle);
        } else {
          window.clearTimeout(idleHandle);
        }
      }
    };
  }, [retryKey]);

  const setAuthenticatedUser = useCallback((user: AuthUser | null) => {
    setState((current) => {
      if (user && current.user?.id === user.id) {
        return { ...current, loading: false, unavailable: false, user };
      }

      return {
        hardcoreUnlocked: false,
        hardcoreAccessLoading: Boolean(user && !user.disabled),
        loading: false,
        unavailable: false,
        user,
      };
    });
    if (!user || user.disabled) return;

    void apiClient.hardcoreStatus().then((status) => {
      setState((current) =>
        current.user?.id === user.id
          ? {
              ...current,
              hardcoreAccessLoading: false,
              hardcoreUnlocked: status.signedIn && status.unlocked,
            }
          : current,
      );
    });
  }, []);

  const retry = useCallback(() => {
    setState((current) => ({
      ...current,
      hardcoreUnlocked: false,
      hardcoreAccessLoading: true,
      loading: true,
      unavailable: false,
    }));
    setRetryKey((current) => current + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      hardcoreUnlocked: state.hardcoreUnlocked,
      hardcoreAccessLoading: state.hardcoreAccessLoading,
      loading: state.loading,
      refreshHardcoreAccess,
      unavailable: state.unavailable,
      user: state.user,
      setAuthenticatedUser,
      signOut: async () => {
        window.localStorage.removeItem(hellModeActiveKey);
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
