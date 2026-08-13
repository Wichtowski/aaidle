"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient, type AuthUser } from "../../../lib/api/client";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;

    const loadUser = () => {
      void apiClient
        .currentUser()
        .then((currentUser) => {
          if (active) setUser(currentUser);
        })
        .catch(() => {
          if (active) setUser(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    const idleWindow = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    const idleCallback = idleWindow.requestIdleCallback?.(loadUser, { timeout: 2_000 });
    const timeout = idleCallback === undefined ? window.setTimeout(loadUser, 750) : undefined;

    return () => {
      active = false;
      if (idleCallback !== undefined) idleWindow.cancelIdleCallback?.(idleCallback);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      user,
      setAuthenticatedUser: setUser,
      signOut: async () => {
        await apiClient.signOut();
        setUser(null);
        window.location.assign("/");
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
