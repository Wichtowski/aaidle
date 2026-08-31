import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "..",
  reporter: [["allure-playwright", { resultsDir: "reports/allure-results" }]],
});
