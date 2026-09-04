import { useMemo, useState } from "react";
import { z } from "zod";

const viewedCluesSchema = z.object({
  scope: z.string(),
  indices: z.array(z.number().int().nonnegative()).max(100),
});
const storageKey = "aaidle:logo-clue-views:v1";

function readViews(scope: string): number[] {
  try {
    const saved = viewedCluesSchema.safeParse(
      JSON.parse(window.localStorage.getItem(storageKey) ?? "null"),
    );
    return saved.success && saved.data.scope === scope ? saved.data.indices : [];
  } catch {
    return [];
  }
}

/** Presentation only: clue eligibility always comes from the API. */
export function useLogoClueViews(playerId: string, challengeId: string | undefined) {
  const scope = `${playerId}:${challengeId ?? ""}`;
  const saved = useMemo(() => readViews(scope), [scope]);
  const [views, setViews] = useState({ scope, indices: saved });
  const indices = views.scope === scope ? views.indices : saved;

  function markViewed(index: number) {
    if (indices.includes(index)) return;
    const next = { scope, indices: [...indices, index] };
    setViews(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The clue still opens when browser storage is unavailable.
    }
  }

  return { viewedClues: indices, markViewed };
}
