import { expect, test } from "../../fixtures/api";
import type { ApiClient, ApiResponse } from "../../fixtures/api";
import { env } from "../../env";

const classicCategories = ["llm", "cv", "nlp", "od", "classical-ml", "filters"];

async function expectSuccessfulJson(response: ApiResponse) {
  expect(response.ok, `Response body:\n${response.body}`).toBe(true);
  return response.json<Record<string, unknown>>();
}

async function expectLogin(apiClient: ApiClient, email: string, password: string) {
  const login = await apiClient.login(email, password);
  const body = await expectSuccessfulJson(login);
  const token = body.accessToken;
  expect(token).toEqual(expect.any(String));
}

test("production API health is available with its health key", async ({ apiClient }) => {
  const { healthKey, expectedVersion } = env;
  test.skip(
    !healthKey || !expectedVersion,
    "Production health key or release version is not configured.",
  );
  if (!healthKey || !expectedVersion) return;

  const response = await apiClient.getHealth(healthKey);

  expect(await expectSuccessfulJson(response)).toMatchObject({
    status: "ok",
    service: "aidle-api",
    apiVersion: "v1",
    version: expectedVersion,
  });
});

test("normal account can access public game modes but not unlock Hardcore", async ({ apiClient }) => {
  const { email, password } = env.normalTestCredentials;
  test.skip(!email || !password, "Production login credentials are not configured.");
  if (!email || !password) return;

  await expectLogin(apiClient, email, password);

  for (const category of classicCategories) {
    const response = await apiClient.getClassicGame(category);
    expect((await expectSuccessfulJson(response)).challenge).toBeTruthy();
  }

  const emoji = await apiClient.getEmojiGame();
  expect((await expectSuccessfulJson(emoji)).challenge).toBeTruthy();

  const timeline = await apiClient.getTimelineGame("75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9");
  expect((await expectSuccessfulJson(timeline)).challenge).toBeTruthy();

  const hardcore = await apiClient.postHardcoreAccess();
  const hardcoreBody = hardcore.json<{ error: { message: string } }>();
  expect(hardcore.status, `Response body:\n${hardcore.body}`).toBe(403);
  expect(hardcoreBody.error.message).toBe(
    "Complete every Classic Challenge category to enter Hardcore.",
  );
});

test("Hardcore account can load the Hardcore game", async ({ apiClient }) => {
  const { email, password } = env.hardcoreTestCredentials;
  test.skip(!email || !password, "Production Hardcore credentials are not configured.");
  if (!email || !password) return;

  await expectLogin(apiClient, email, password);
  const response = await apiClient.getHardcoreGame();

  expect((await expectSuccessfulJson(response)).challenge).toBeTruthy();
});

test("deactivated account cannot obtain an access token", async ({ apiClient }) => {
  const { email, password } = env.deactivatedTestCredentials;
  test.skip(!email || !password, "Production deactivated-account credentials are not configured.");
  if (!email || !password) return;

  const login = await apiClient.login(email, password);

  expect(login.status, `Response body:\n${login.body}`).toBe(403);
  expect(login.json<{ error: { message: string } }>().error.message).toBe(
    "This account has been disabled.",
  );
});
