export default {
  extends: "lighthouse:default",
  settings: {
    onlyCategories: ["performance"],
    output: ["html", "json"],
    chromeFlags: ["--headless=new", "--no-sandbox"],
  },
};
