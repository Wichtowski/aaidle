export default {
  extends: "lighthouse:default",
  settings: {
    onlyCategories: ["performance"],
    output: ["html", "json"],
    chromeFlags: ["--headless", "--no-sandbox"],
  },
};
