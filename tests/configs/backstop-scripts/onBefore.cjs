const globalLeaderboard = {
  rank: 1,
  displayName: "runner",
  isCurrentUser: false,
  completedSpeedruns: 12,
  averageTimeMs: 18_500,
  averageSubmissions: 2.4,
  fastestTimeMs: 12_300,
  recentRuns: [
    { date: "2026-08-24", submissions: 3, timeMs: 19_000 },
    { date: "2026-08-25", submissions: 2, timeMs: 15_500 },
    { date: "2026-08-26", submissions: 1, timeMs: 12_300 },
  ],
};

// eslint-disable-next-line no-undef
module.exports = async (page, scenario, _viewport, _isReference, browserContext) => {
  // eslint-disable-next-line no-undef
  const token = process.env.AAIDLE_CF_E2E_TOKEN;
  if (token) {
    await browserContext.setExtraHTTPHeaders({
      "x-aaidle-cf-e2e-token": token,
    });
  }

  if (scenario.label !== "Cookie Banner") {
    await browserContext.addCookies([
      {
        name: "aaidle_cookie_consent",
        value: "essential",
        // eslint-disable-next-line no-undef
        url: new URL(scenario.url).origin,
        sameSite: "Lax",
      },
    ]);
  }

  if (scenario.label === "Timeline global leaderboard") {
    await page.route("**/api/v1/games/timeline/leaderboard/global", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          fastest: [globalLeaderboard],
          average: [globalLeaderboard],
          completions: [globalLeaderboard],
        }),
      });
    });
  }

  if (scenario.label === "Timeline daily leaderboard") {
    await page.route("**/api/v1/games/timeline/leaderboard/20260826", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          challengeDate: "2026-08-26",
          entries: [
            {
              rank: 1,
              displayName: "runner",
              isCurrentUser: false,
              submissions: 2,
              timeMs: 12_345,
            },
            {
              rank: 2,
              displayName: "challenger",
              isCurrentUser: false,
              submissions: 3,
              timeMs: 15_000,
            },
          ],
        }),
      });
    });
  }
};
