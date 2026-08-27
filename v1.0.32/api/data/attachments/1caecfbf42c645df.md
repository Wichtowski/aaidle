# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/api/public-api.spec.ts >> normal account can access public game modes but not unlock Hardcore
- Location: tests/specs/api/public-api.spec.ts:45:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { env } from "../../env";
  3   | 
  4   | const classicCategories = ["llm", "cv", "nlp", "od", "classical-ml", "filters"];
  5   | 
  6   | const apiUrl = (path: string) => new URL(path, env.baseURL);
  7   | const apiHeaders = (headers: HeadersInit = {}) => ({
  8   |   ...headers,
  9   |   ...(env.cloudflareE2EToken ? { "x-aaidle-cf-e2e-token": env.cloudflareE2EToken } : {}),
  10  | });
  11  | 
  12  | async function accessToken(email: string, password: string) {
  13  |   const login = await fetch(apiUrl("/api/v1/auth/token"), {
  14  |     method: "POST",
  15  |     headers: apiHeaders({ "Content-Type": "application/json" }),
  16  |     body: JSON.stringify({ email, password }),
  17  |   });
> 18  |   expect(login.ok).toBe(true);
      |                    ^ Error: expect(received).toBe(expected) // Object.is equality
  19  |   const { accessToken: token } = await login.json();
  20  |   expect(token).toEqual(expect.any(String));
  21  |   return token as string;
  22  | }
  23  | 
  24  | test("production API health is available with its health key", async () => {
  25  |   const { healthKey, expectedVersion } = env;
  26  |   test.skip(
  27  |     !healthKey || !expectedVersion,
  28  |     "Production health key or release version is not configured.",
  29  |   );
  30  |   if (!healthKey || !expectedVersion) return;
  31  | 
  32  |   const response = await fetch(apiUrl("/api/v1/health"), {
  33  |     headers: apiHeaders({ "x-aaidle-health-key": healthKey }),
  34  |   });
  35  | 
  36  |   expect(response.ok).toBe(true);
  37  |   expect(await response.json()).toMatchObject({
  38  |     status: "ok",
  39  |     service: "aidle-api",
  40  |     apiVersion: "v1",
  41  |     version: expectedVersion,
  42  |   });
  43  | });
  44  | 
  45  | test("normal account can access public game modes but not unlock Hardcore", async () => {
  46  |   const { email, password } = env.normalTestCredentials;
  47  |   test.skip(!email || !password, "Production login credentials are not configured.");
  48  |   if (!email || !password) return;
  49  | 
  50  |   const token = await accessToken(email, password);
  51  |   const headers = apiHeaders({ Authorization: `Bearer ${token}` });
  52  | 
  53  |   for (const category of classicCategories) {
  54  |     const response = await fetch(apiUrl(`/api/v1/games/classic/${category}/normal`), { headers });
  55  |     expect(response.ok).toBe(true);
  56  |     expect((await response.json()).challenge).toBeTruthy();
  57  |   }
  58  | 
  59  |   const emoji = await fetch(apiUrl("/api/v1/games/emoji/normal"), { headers });
  60  |   expect(emoji.ok).toBe(true);
  61  |   expect((await emoji.json()).challenge).toBeTruthy();
  62  | 
  63  |   const hardcore = await fetch(apiUrl("/api/v1/games/classic/hardcore/access"), {
  64  |     method: "POST",
  65  |     headers: apiHeaders({ ...headers, Origin: env.baseURL }),
  66  |   });
  67  |   expect(hardcore.status).toBe(403);
  68  |   expect((await hardcore.json()).error.message).toBe(
  69  |     "Complete every Classic Challenge category to enter Hardcore.",
  70  |   );
  71  | });
  72  | 
  73  | test("Hardcore account can load the Hardcore game", async () => {
  74  |   const { email, password } = env.hardcoreTestCredentials;
  75  |   test.skip(!email || !password, "Production Hardcore credentials are not configured.");
  76  |   if (!email || !password) return;
  77  | 
  78  |   const token = await accessToken(email, password);
  79  |   const response = await fetch(apiUrl("/api/v1/games/classic/hardcore"), {
  80  |     headers: apiHeaders({ Authorization: `Bearer ${token}` }),
  81  |   });
  82  | 
  83  |   expect(response.ok).toBe(true);
  84  |   expect((await response.json()).challenge).toBeTruthy();
  85  | });
  86  | 
  87  | test("deactivated account cannot obtain an access token", async () => {
  88  |   const { email, password } = env.deactivatedTestCredentials;
  89  |   test.skip(!email || !password, "Production deactivated-account credentials are not configured.");
  90  |   if (!email || !password) return;
  91  | 
  92  |   const login = await fetch(apiUrl("/api/v1/auth/token"), {
  93  |     method: "POST",
  94  |     headers: { "Content-Type": "application/json" },
  95  |     body: JSON.stringify({ email, password }),
  96  |   });
  97  | 
  98  |   expect(login.status).toBe(403);
  99  |   expect((await login.json()).error.message).toBe("This account has been disabled.");
  100 | });
  101 | 
```