const baseURL = "https://aaidle.com";


export const env = {
  baseURL,
  isCI: process.env.CI === "true",
  expectedVersion: process.env.AAIDLE_VERSION,
  healthKey: process.env.PLAYWRIGHT_HEALTH_KEY,
  cloudflareE2EToken: process.env.AAIDLE_CF_E2E_TOKEN,
  testCredentials: {
    email: process.env.PLAYWRIGHT_TEST_EMAIL,
    password: process.env.PLAYWRIGHT_TEST_PASSWORD,
  },
  github: {
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    token: process.env.GITHUB_TOKEN,
    stepSummaryPath: process.env.GITHUB_STEP_SUMMARY,
  },
} as const;
