export type Game = { id: string; categories: string[] };
export type Navigation = { games: Game[]; difficulties: string[] };
export type ItemSummary = { id: string; name: string; minPool: number };
export type GitStatus = {
  branch: string;
  changedPaths: string[];
  hasChanges: boolean;
  canPublish: boolean;
  githubAuthenticated: boolean;
};

type ErrorPayload = { error?: string; details?: string[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json()) as T & ErrorPayload;
  if (!response.ok) {
    const details = payload.details?.length ? `\n${payload.details.join("\n")}` : "";
    throw new Error(`${payload.error ?? `Request failed (${response.status})`}${details}`);
  }
  return payload;
}

function query(game: string, category: string, difficulty?: string): string {
  const params = new URLSearchParams({ game });
  if (category) params.set("category", category);
  if (difficulty) params.set("difficulty", difficulty);
  return params.toString();
}

export const api = {
  navigation: () => request<Navigation>("/api/navigation"),
  items: (game: string, category: string, difficulty: string) =>
    request<{ items: ItemSummary[] }>(`/api/items?${query(game, category, difficulty)}`),
  item: (game: string, category: string, id: string) =>
    request<{ item: Record<string, unknown> }>(
      `/api/items/${encodeURIComponent(id)}?${query(game, category)}`,
    ),
  save: (game: string, category: string, id: string, item: Record<string, unknown>) =>
    request<{ item: Record<string, unknown>; validation: { valid: true; output: string } }>(
      `/api/items/${encodeURIComponent(id)}?${query(game, category)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      },
    ),
  analyse: (game: string, item: Record<string, unknown>) =>
    request<{
      summary: string;
      suggestedItem: Record<string, unknown>;
      model: string;
      usage: { input_tokens?: number; output_tokens?: number };
    }>("/api/ai/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, item }),
    }),
  validate: () =>
    request<{ valid: true; output: string }>("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  merge: (game: string) =>
    request<{ game: string; output: string }>("/api/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game }),
    }),
  gitStatus: () => request<GitStatus>("/api/git/status"),
  publish: (payload: { message: string; title: string; body: string }) =>
    request<{ branch: string; url: string }>("/api/git/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};
