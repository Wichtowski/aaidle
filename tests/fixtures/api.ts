import { test as base, type APIRequestContext } from "@playwright/test";
import { cloudflareE2EHeaders } from "../http-headers";

export type ApiResponse = {
  body: string;
  ok: boolean;
  status: number;
  json: <T>() => T;
};

export class ApiClient {
  private bearerToken: string | undefined;

  constructor(private readonly request: APIRequestContext) {}

  async get(path: string, headers: Record<string, string> = {}): Promise<ApiResponse> {
    return this.send("GET", path, headers);
  }

  async post(
    path: string,
    data?: unknown,
    headers: Record<string, string> = {},
  ): Promise<ApiResponse> {
    return this.send("POST", path, headers, data);
  }

  async login(email: string, password: string): Promise<ApiResponse> {
    const response = await this.post("/api/v1/auth/token", { email, password });
    if (response.ok) {
      const token = response.json<{ accessToken?: unknown }>().accessToken;
      if (typeof token === "string") this.bearerToken = token;
    }
    return response;
  }

  getHealth(healthKey: string): Promise<ApiResponse> {
    return this.get("/api/v1/health", { "x-aaidle-health-key": healthKey });
  }

  getClassicGame(category: string): Promise<ApiResponse> {
    return this.get(`/api/v1/games/classic/${category}/normal`, this.authorizationHeaders());
  }

  getEmojiGame(): Promise<ApiResponse> {
    return this.get("/api/v1/games/emoji/normal", this.authorizationHeaders());
  }

  getTimelineGame(playerId: string): Promise<ApiResponse> {
    return this.get(
      `/api/v1/games/timeline/normal?playerId=${encodeURIComponent(playerId)}`,
      this.authorizationHeaders(),
    );
  }

  getHardcoreGame(): Promise<ApiResponse> {
    return this.get("/api/v1/games/classic/hardcore", this.authorizationHeaders());
  }

  postHardcoreAccess(): Promise<ApiResponse> {
    return this.post("/api/v1/games/classic/hardcore/access", undefined, {
      ...this.authorizationHeaders(),
      Origin: "https://aaidle.com",
    });
  }

  private authorizationHeaders(): Record<string, string> {
    return this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {};
  }

  private async send(
    method: "GET" | "POST",
    path: string,
    headers: Record<string, string>,
    data?: unknown,
  ): Promise<ApiResponse> {
    const response = await this.request.fetch(path, {
      method,
      headers: {
        ...(cloudflareE2EHeaders() ?? {}),
        ...(data === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(data === undefined ? {} : { data }),
    });
    const body = await response.text();

    if (!response.ok()) {
      // Keep the complete response visible in CI so proxy and WAF failures are diagnosable
      console.error(`[API ${method} ${path}] HTTP ${response.status()}\n${body}`);
    }

    return {
      body,
      ok: response.ok(),
      status: response.status(),
      json: <T>() => JSON.parse(body) as T,
    };
  }
}

type ApiFixtures = {
  apiClient: ApiClient;
};

export const test = base.extend<ApiFixtures>({
  apiClient: async ({ request }, use) => {
    await use(new ApiClient(request));
  },
});

export { expect } from "@playwright/test";
