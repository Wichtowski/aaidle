import { expect, test } from "@playwright/test";
import { env } from "../../env";

const classicCategories = ["llm", "cv", "nlp", "od", "classical-ml", "filters"];

const apiUrl = (path: string) => new URL(path, env.baseURL);
const apiHeaders = (headers: HeadersInit = {}) => ({
  ...headers,
  ...(env.cloudflareE2EToken ? { "x-aaidle-cf-e2e-token": env.cloudflareE2EToken } : {}),
});

async function accessToken(email: string, password: string) {
  const login = await fetch(apiUrl("/api/v1/auth/token"), {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  });
  expect(login.ok).toBe(true);
  const { accessToken: token } = await login.json();
  expect(token).toEqual(expect.any(String));
  return token as string;
}

test("production API health is available with its health key", async () => {
  const { healthKey, expectedVersion } = env;
  test.skip(
    !healthKey || !expectedVersion,
    "Production health key or release version is not configured.",
  );
  if (!healthKey || !expectedVersion) return;

  const response = await fetch(apiUrl("/api/v1/health"), {
    headers: apiHeaders({ "x-aaidle-health-key": healthKey }),
  });

  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({
    status: "ok",
    service: "aidle-api",
    apiVersion: "v1",
    version: expectedVersion,
  });
});

test("normal account can access public game modes but not unlock Hardcore", async () => {
  const { email, password } = env.normalTestCredentials;
  test.skip(!email || !password, "Production login credentials are not configured.");
  if (!email || !password) return;

  const token = await accessToken(email, password);
  const headers = apiHeaders({ Authorization: `Bearer ${token}` });

  for (const category of classicCategories) {
    const response = await fetch(apiUrl(`/api/v1/games/classic/${category}/normal`), { headers });
    expect(response.ok).toBe(true);
    expect((await response.json()).challenge).toBeTruthy();
  }

  const emoji = await fetch(apiUrl("/api/v1/games/emoji/normal"), { headers });
  expect(emoji.ok).toBe(true);
  expect((await emoji.json()).challenge).toBeTruthy();

  const hardcore = await fetch(apiUrl("/api/v1/games/classic/hardcore/access"), {
    method: "POST",
    headers: apiHeaders({ ...headers, Origin: env.baseURL }),
  });
  expect(hardcore.status).toBe(403);
  expect((await hardcore.json()).error.message).toBe(
    "Complete every Classic Challenge category to enter Hardcore.",
  );
});

test("Hardcore account can load the Hardcore game", async () => {
  const { email, password } = env.hardcoreTestCredentials;
  test.skip(!email || !password, "Production Hardcore credentials are not configured.");
  if (!email || !password) return;

  const token = await accessToken(email, password);
  const response = await fetch(apiUrl("/api/v1/games/classic/hardcore"), {
    headers: apiHeaders({ Authorization: `Bearer ${token}` }),
  });

  expect(response.ok).toBe(true);
  expect((await response.json()).challenge).toBeTruthy();
});

test("deactivated account cannot obtain an access token", async () => {
  const { email, password } = env.deactivatedTestCredentials;
  test.skip(!email || !password, "Production deactivated-account credentials are not configured.");
  if (!email || !password) return;

  const login = await fetch(apiUrl("/api/v1/auth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  expect(login.status).toBe(403);
  expect((await login.json()).error.message).toBe("This account has been disabled.");
});
