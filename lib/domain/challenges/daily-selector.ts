import { NoEligibleModelsError } from "./challenge-types";
export type SelectableModel = { id: string };
export async function stableSelectionIndex(
  date: string,
  mode: string,
  secret: string,
  version: number,
  count: number,
) {
  const input = new TextEncoder().encode(`${date}:${mode}:${secret}:${version}`);
  const hash = await crypto.subtle.digest("SHA-256", input);
  const bytes = new Uint8Array(hash);
  let value = 0;
  for (let index = 0; index < 4; index += 1) value = (value * 256 + bytes[index]) >>> 0;
  return value % count;
}
export async function selectDailyModel({
  date,
  mode,
  secret,
  selectionVersion = 1,
  models,
  recentlyUsed = [],
  cooldownDays = 60,
}: {
  date: string;
  mode: string;
  secret: string;
  selectionVersion?: number;
  models: SelectableModel[];
  recentlyUsed?: string[];
  cooldownDays?: number;
}) {
  if (!models.length) throw new NoEligibleModelsError();
  const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id));
  const blocked = new Set(recentlyUsed.slice(0, cooldownDays));
  let candidates = sorted.filter((model) => !blocked.has(model.id));
  if (!candidates.length) candidates = sorted.filter((model) => model.id !== recentlyUsed[0]);
  if (!candidates.length) candidates = sorted;
  return candidates[
    await stableSelectionIndex(date, mode, secret, selectionVersion, candidates.length)
  ]!;
}
