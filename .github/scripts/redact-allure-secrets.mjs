import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const targetDirectory = "tests";
const redactions = {
  CloudflareE2EToken: { suffix: "14cb2fa26b" },
  HealthKey: { suffix: "9d5cfe746a" },
  PlaywrightTestPassword: { environmentVariable: "AAIDLE_PLAYWRIGHT_TEST_PASSWORD" },
  PlaywrightTestEmail: { pattern: /[A-Z0-9._%+-]+@aaidle\.com/gi },
};
const requestedRedactions = process.argv.slice(2);

if (requestedRedactions.length === 0) {
  throw new Error("Usage: redact-allure-secrets.mjs <redaction> [<redaction> ...]");
}

const escapeRegularExpression = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = requestedRedactions.map((name) => {
  const redaction = redactions[name];
  if (!redaction) {
    throw new Error(
      `Unknown redaction ${name}. Available redactions: ${Object.keys(redactions).join(", ")}`,
    );
  }
  if (redaction.suffix) {
    return new RegExp(
      `[a-fA-F0-9]{${64 - redaction.suffix.length}}${escapeRegularExpression(redaction.suffix)}`,
      "g",
    );
  }
  if (redaction.pattern) return redaction.pattern;

  const secret = process.env[redaction.environmentVariable];
  if (!secret) {
    throw new Error(`Missing ${redaction.environmentVariable} for ${name} redaction.`);
  }
  return new RegExp(escapeRegularExpression(secret), "g");
});
let replacementCount = 0;

async function sanitize(target) {
  const targetStat = await stat(target);
  if (targetStat.isDirectory()) {
    const entries = await readdir(target);
    await Promise.all(entries.map((entry) => sanitize(path.join(target, entry))));
    return;
  }

  if (!targetStat.isFile()) return;
  const contents = await readFile(target, "utf8");
  const sanitized = patterns.reduce(
    (current, pattern) =>
      current.replace(pattern, () => {
        replacementCount += 1;
        return "***";
      }),
    contents,
  );
  if (sanitized !== contents) await writeFile(target, sanitized);
}

try {
  await sanitize(targetDirectory);
  console.log(`Applied ${replacementCount} redaction(s) in ${targetDirectory}.`);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log("The tests directory does not exist; nothing to sanitize.");
  } else {
    throw error;
  }
}
