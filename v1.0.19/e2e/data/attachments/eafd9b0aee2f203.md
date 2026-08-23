# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/e2e/hardcore-access.spec.ts >> Hardcore account can open the Hardcore game
- Location: tests/specs/e2e/hardcore-access.spec.ts:7:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('game-heading')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('game-heading')

```

```yaml
- main:
  - img "Icon for aaidle.com"
  - heading "aaidle.com" [level=1]
  - heading "Performing security verification" [level=2]
  - paragraph: This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.
  - heading "Incompatible browser extension or network configuration" [level=2]
  - paragraph: "Your browser extensions or network settings have blocked the security verification process required by aaidle.com. To resolve this, try the following steps:"
  - paragraph: "Temporarily disable browser extensions:"
  - list:
    - listitem: Go to your browser settings.
    - listitem: Locate your browser extensions and temporarily disable them.
    - listitem:
      - text: Once browser extensions are disabled,
      - link "refresh this page":
        - /url: "#"
      - text: .
  - paragraph: "Check your network settings:"
  - list:
    - listitem: Verify if your internet or firewall settings have blocked your device from reaching “challenges.cloudflare.com”. You may need to consult your operating system's help documentation or your network administrator for guidance on adjusting firewall settings.
    - listitem: If you do not have permission to adjust network settings, try connecting to a different network.
  - paragraph:
    - text: If these steps do not resolve the issue, refer to Cloudflare's
    - link "troubleshooting documentation":
      - /url: /cdn-cgi/challenge-platform/help
    - text: for more help. For detailed guidance on how to disable your browser extensions or check your network settings, refer to your browser or device’s documentation.
- contentinfo:
  - text: "Ray ID:"
  - code: a2fcbbfdb856f082
  - text: Performance and Security by
  - link "Cloudflare, opens in a new tab":
    - /url: https://www.cloudflare.com?utm_source=challenge&utm_campaign=m
    - text: Cloudflare
  - link "Privacy, opens in a new tab":
    - /url: https://www.cloudflare.com/privacypolicy/
    - text: Privacy
```

# Test source

```ts
  1  | import { env } from "../../env";
  2  | import { expect, test } from "../../fixtures/e2e";
  3  | 
  4  | // Never publish browser artifacts from the test that receives a production password
  5  | test.use({ trace: "off", screenshot: "off", video: "off" });
  6  | 
  7  | test("Hardcore account can open the Hardcore game", async ({ loginPage, page }) => {
  8  |   const { email, password } = env.hardcoreTestCredentials;
  9  |   test.skip(!email || !password, "Production Hardcore credentials are not configured.");
  10 |   if (!email || !password) return;
  11 | 
  12 |   await loginPage.goto();
  13 |   await loginPage.signIn(email, password);
  14 |   await page.goto("/classic/hardcore");
  15 | 
> 16 |   await expect(page.getByTestId("game-heading")).toBeVisible();
     |                                                  ^ Error: expect(locator).toBeVisible() failed
  17 |   await expect(page.getByText("Nothing answers.")).toBeHidden();
  18 | });
  19 | 
```