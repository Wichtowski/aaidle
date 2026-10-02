import { createContext } from "react";
import type { DailyCompletionSummary } from "@lib/validation/daily-completion";
export const DailyCompletionContext = createContext<{
  summary: DailyCompletionSummary | null;
  reopen: (date?: string) => void;
} | null>(null);
