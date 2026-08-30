import { createContext } from "react";
import type { AuthUser } from "@lib/api/client";

export type AuthContextValue = {
  hardcoreUnlocked: boolean;
  hardcoreAccessLoading: boolean;
  loading: boolean;
  unavailable: boolean;
  user: AuthUser | null;
  refreshHardcoreAccess: () => Promise<void>;
  setAuthenticatedUser: (user: AuthUser | null) => void;
  signOut: () => Promise<void>;
  retry: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
