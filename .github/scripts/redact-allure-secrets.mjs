import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const targetDirectory = "tests";
const redactionSuffixes = {
  CloudflareE2EToken: "14cb2fa26b",
  HealthKey: "9d5cfe746a",
};
const requestedRedactions = process.argv.slice(2);

if (requestedRedactions.length === 0) {
  throw new Error("Usage: redact-allure-secrets.mjs <redaction> [<redaction> ...]");
}

const escapeRegularExpression = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = requestedRedactions.map((name) => {
  const suffix = redactionSuffixes[name];
  if (!suffix) {
    throw new Error(
      `Unknown redaction ${name}. Available redactions: ${Object.keys(redactionSuffixes).join(", ")}`,
    );
  }
  return new RegExp(`[a-fA-F0-9]{${64 - suffix.length}}${escapeRegularExpression(suffix)}`, "g");
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
