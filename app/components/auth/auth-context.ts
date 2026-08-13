"use client";

import { createContext } from "react";
import type { AuthUser } from "../../../lib/api/client";

export type AuthContextValue = {
  loading: boolean;
  user: AuthUser | null;
  setAuthenticatedUser: (user: AuthUser | null) => void;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
