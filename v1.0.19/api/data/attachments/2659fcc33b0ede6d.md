# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/api/public-api.spec.ts >> deactivated account cannot obtain an access token
- Location: tests/specs/api/public-api.spec.ts:83:1

# Error details

```
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { env } from "../../env";
  3  | 
  4  | const classicCategories = ["llm", "cv", "nlp", "od", "classical-ml", "filters"];
  5  | 
  6  | const apiUrl = (path: string) => new URL(path, env.baseURL);
  7  | 
  8  | async function accessToken(email: string, password: string) {
  9  |   const login = await fetch(apiUrl("/api/v1/auth/token"), {
  10 |     method: "POST",
  11 |     headers: { "Content-Type": "application/json" },
  12 |     body: JSON.stringify({ email, password }),
  13 |   });
  14 |   expect(login.ok).toBe(true);
  15 |   const { accessToken: token } = await login.json();
  16 |   expect(token).toEqual(expect.any(String));
  17 |   return token as string;
  18 | }
  19 | 
  20 | test("production API health is available with its health key", async () => {
  21 |   const { healthKey, expectedVersion } = env;
  22 |   test.skip(
  23 |     !healthKey || !expectedVersion,
  24 |     "Production health key or release version is not configured.",
  25 |   );
  26 |   if (!healthKey || !expectedVersion) return;
  27 | 
  28 |   const response = await fetch(apiUrl("/api/v1/health"), {
  29 |     headers: { "x-aaidle-health-key": healthKey },
  30 |   });
  31 | 
  32 |   expect(response.ok).toBe(true);
  33 |   expect(await response.json()).toMatchObject({
  34 |     status: "ok",
  35 |     service: "aidle-api",
  36 |     apiVersion: "v1",
  37 |     version: expectedVersion,
  38 |   });
  39 | });
  40 | 
  41 | test("normal account can access public game modes but not unlock Hardcore", async () => {
  42 |   const { email, password } = env.normalTestCredentials;
  43 |   test.skip(!email || !password, "Production login credentials are not configured.");
  44 |   if (!email || !password) return;
  45 | 
  46 |   const token = await accessToken(email, password);
  47 |   const headers = { Authorization: `Bearer ${token}` };
  48 | 
  49 |   for (const category of classicCategories) {
  50 |     const response = await fetch(apiUrl(`/api/v1/games/classic/${category}/normal`), { headers });
  51 |     expect(response.ok).toBe(true);
  52 |     expect((await response.json()).challenge).toBeTruthy();
  53 |   }
  54 | 
  55 |   const emoji = await fetch(apiUrl("/api/v1/games/emoji-clues/normal"), { headers });
  56 |   expect(emoji.ok).toBe(true);
  57 |   expect((await emoji.json()).challenge).toBeTruthy();
  58 | 
  59 |   const hardcore = await fetch(apiUrl("/api/v1/games/classic/hardcore/access"), {
  60 |     method: "POST",
  61 |     headers: { ...headers, Origin: env.baseURL },
  62 |   });
  63 |   expect(hardcore.status).toBe(403);
  64 |   expect((await hardcore.json()).error.message).toBe(
  65 |     "Complete every Classic Challenge category to enter Hardcore.",
  66 |   );
  67 | });
  68 | 
  69 | test("Hardcore account can load the Hardcore game", async () => {
  70 |   const { email, password } = env.hardcoreTestCredentials;
  71 |   test.skip(!email || !password, "Production Hardcore credentials are not configured.");
  72 |   if (!email || !password) return;
  73 | 
  74 |   const token = await accessToken(email, password);
  75 |   const response = await fetch(apiUrl("/api/v1/games/classic/hardcore"), {
  76 |     headers: { Authorization: `Bearer ${token}` },
  77 |   });
  78 | 
  79 |   expect(response.ok).toBe(true);
  80 |   expect((await response.json()).challenge).toBeTruthy();
  81 | });
  82 | 
  83 | test("deactivated account cannot obtain an access token", async () => {
  84 |   const { email, password } = env.deactivatedTestCredentials;
  85 |   test.skip(!email || !password, "Production deactivated-account credentials are not configured.");
  86 |   if (!email || !password) return;
  87 | 
  88 |   const login = await fetch(apiUrl("/api/v1/auth/token"), {
  89 |     method: "POST",
  90 |     headers: { "Content-Type": "application/json" },
  91 |     body: JSON.stringify({ email, password }),
  92 |   });
  93 | 
  94 |   expect(login.status).toBe(403);
> 95 |   expect((await login.json()).error.message).toBe("This account has been disabled.");
     |           ^ SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
  96 | });
  97 | 
```