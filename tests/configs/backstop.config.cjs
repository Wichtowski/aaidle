const baseUrl = process.env.AAIDLE_VISUAL_BASE_URL ?? "https://aaidle.com";

module.exports = {
  id: "aaidle-visual-regression",
  engine: "playwright",
  onBeforeScript: "onBefore.cjs",
  onReadyScript: "onReady.cjs",
  viewports: [
    { label: "desktop", width: 1440, height: 900 },
    { label: "mobile", width: 390, height: 844 },
  ],
  scenarioDefaults: {
    readySelector: "body",
    delay: 1000,
    selectors: ["document"],
    misMatchThreshold: 0.1,
    requireSameDimensions: true,
  },
  scenarios: [
    { label: "Homepage", url: `${baseUrl}/` },
    { label: "Classic", url: `${baseUrl}/classic` },
    { label: "Emoji", url: `${baseUrl}/emoji` },
    { label: "Timeline", url: `${baseUrl}/timeline` },
    { label: "Profile", url: `${baseUrl}/profile` },
    { label: "Login", url: `${baseUrl}/login` },
    { label: "Register", url: `${baseUrl}/register` },
    { label: "Privacy policy", url: `${baseUrl}/privacy/v1` },
    { label: "Credits", url: `${baseUrl}/credits` },
    { label: "Report an issue", url: `${baseUrl}/report-issue` },
    { label: "404", url: `${baseUrl}/404` },
  ],
  paths: {
    bitmaps_reference: "tests/reports/visual/bitmaps_reference",
    bitmaps_test: "tests/reports/visual/bitmaps_test",
    html_report: "tests/reports/visual/html_report",
    ci_report: "tests/reports/visual/ci_report",
    engine_scripts: "tests/configs/backstop-scripts",
  },
  engineOptions: {
    browser: "chromium",
    args: ["--no-sandbox"],
  },
  report: ["browser", "CI"],
  openReport: false,
  archiveReport: true,
  scenarioLogsInReports: true,
};
