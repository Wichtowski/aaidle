const baseURL = "https://aaidle.com";

const environmentEntries = [
  ["CI", process.env.CI],
  ["AAIDLE_VERSION", process.env.AAIDLE_VERSION],
  ["AAIDLE_PLAYWRIGHT_HEALTH_KEY", process.env.AAIDLE_PLAYWRIGHT_HEALTH_KEY],
  ["AAIDLE_CF_E2E_TOKEN", process.env.AAIDLE_CF_E2E_TOKEN],
  [
    "AAIDLE_PLAYWRIGHT_DEACTIVATED_TEST_EMAIL",
    process.env.AAIDLE_PLAYWRIGHT_DEACTIVATED_TEST_EMAIL,
  ],
  ["AAIDLE_PLAYWRIGHT_HARDCORE_TEST_EMAIL", process.env.AAIDLE_PLAYWRIGHT_HARDCORE_TEST_EMAIL],
  ["AAIDLE_PLAYWRIGHT_NORMAL_TEST_EMAIL", process.env.AAIDLE_PLAYWRIGHT_NORMAL_TEST_EMAIL],
  ["AAIDLE_PLAYWRIGHT_UNVERIFIED_TEST_EMAIL", process.env.AAIDLE_PLAYWRIGHT_UNVERIFIED_TEST_EMAIL],
  ["AAIDLE_PLAYWRIGHT_TEST_PASSWORD", process.env.AAIDLE_PLAYWRIGHT_TEST_PASSWORD],
  ["GITHUB_REPOSITORY", process.env.GITHUB_REPOSITORY],
  ["GITHUB_RUN_ID", process.env.GITHUB_RUN_ID],
  ["GITHUB_TOKEN", process.env.GITHUB_TOKEN],
  ["GITHUB_STEP_SUMMARY", process.env.GITHUB_STEP_SUMMARY],
  ["LIGHTHOUSE_PERFORMANCE_THRESHOLD", process.env.LIGHTHOUSE_PERFORMANCE_THRESHOLD],
] as const;

const secretEnvironmentVariables = new Set([
  "AAIDLE_PLAYWRIGHT_HEALTH_KEY",
  "AAIDLE_CF_E2E_TOKEN",
  "AAIDLE_PLAYWRIGHT_TEST_PASSWORD",
  "GITHUB_TOKEN",
]);

export function logPlaywrightEnvironment() {
  // eslint-disable-next-line no-console
  console.table(
    environmentEntries.map(([name, value]) => ({
      name,
      value: secretEnvironmentVariables.has(name)
        ? value
          ? "[set]"
          : "[unset]"
        : (value ?? "[unset]"),
    })),
  );
}

export default class PlaywrightEnvironmentReporter {
  onBegin() {
    logPlaywrightEnvironment();
  }
}

export const env = {
  baseURL,
  isCI: process.env.CI === "true",
  expectedVersion: process.env.AAIDLE_VERSION,
  healthKey: process.env.AAIDLE_PLAYWRIGHT_HEALTH_KEY,
  cloudflareE2EToken: process.env.AAIDLE_CF_E2E_TOKEN,
  deactivatedTestCredentials: {
    email: process.env.AAIDLE_PLAYWRIGHT_DEACTIVATED_TEST_EMAIL,
    password: process.env.AAIDLE_PLAYWRIGHT_TEST_PASSWORD,
  },
  hardcoreTestCredentials: {
    email: process.env.AAIDLE_PLAYWRIGHT_HARDCORE_TEST_EMAIL,
    password: process.env.AAIDLE_PLAYWRIGHT_TEST_PASSWORD,
  },
  normalTestCredentials: {
    email: process.env.AAIDLE_PLAYWRIGHT_NORMAL_TEST_EMAIL,
    password: process.env.AAIDLE_PLAYWRIGHT_TEST_PASSWORD,
  },
  unverifiedTestCredentials: {
    email: process.env.AAIDLE_PLAYWRIGHT_UNVERIFIED_TEST_EMAIL,
    password: process.env.AAIDLE_PLAYWRIGHT_TEST_PASSWORD,
  },
  github: {
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    token: process.env.GITHUB_TOKEN,
    stepSummaryPath: process.env.GITHUB_STEP_SUMMARY,
  },
} as const;
