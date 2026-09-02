import { existsSync, readFileSync } from "node:fs";

const source = new URL("../data/logo.seed.json", import.meta.url);
const entries = JSON.parse(readFileSync(source, "utf8"));
const visualTypes = new Set(["logo", "discoverer-portrait", "technology", "other"]);
const fail = (message) => {
  throw new Error(`Logo seed: ${message}`);
};

if (!Array.isArray(entries) || entries.length < 6) fail("at least six entries are required");
const answers = new Set();
const paths = new Set();
for (const entry of entries) {
  if (!entry || typeof entry !== "object") fail("each entry must be an object");
  if (typeof entry.answerId !== "string" || !entry.answerId) fail("entry has an invalid answerId");
  if (answers.has(entry.answerId)) fail(`duplicate answerId ${entry.answerId}`);
  answers.add(entry.answerId);
  if (![0, 1, 2].includes(entry.minPool)) fail(`${entry.answerId} has invalid minPool`);
  if (!visualTypes.has(entry.visualType)) fail(`${entry.answerId} has invalid visualType`);
  if (typeof entry.assetName !== "string" || !entry.assetName.trim())
    fail(`${entry.answerId} needs an assetName`);
  const assetPath = entry.assetPath ?? entry.asset;
  if (
    typeof assetPath !== "string" ||
    assetPath.includes("..") ||
    (!assetPath.startsWith("/logo-visual/") && assetPath.includes("/"))
  )
    fail(`${entry.answerId} needs a private Logo asset filename`);
  const assetName = assetPath.replace(/^\/logo-visual\//, "");
  if (paths.has(assetName)) fail(`duplicate asset ${assetName}`);
  paths.add(assetName);
  if (!existsSync(new URL(`../data/logo-visual/${assetName}`, import.meta.url)))
    fail(`${entry.answerId} is missing private asset ${assetName}`);
  if (entry.revealProfile !== "progressive-zoom")
    fail(`${entry.answerId} has an invalid revealProfile`);
  if (
    typeof entry.focalPoint?.x !== "number" ||
    typeof entry.focalPoint?.y !== "number" ||
    entry.focalPoint.x < 0 ||
    entry.focalPoint.x > 512 ||
    entry.focalPoint.y < 0 ||
    entry.focalPoint.y > 512
  )
    fail(`${entry.answerId} has an invalid focalPoint`);
  if (
    !Array.isArray(entry.clues) ||
    !entry.clues.some(
      (clue) =>
        clue?.afterIncorrectGuesses <= 5 &&
        typeof clue.kind === "string" &&
        clue.kind &&
        (clue.kind === "image" || (typeof clue.text === "string" && clue.text.trim())),
    )
  )
    fail(`${entry.answerId} needs a clue reachable by five misses`);
  if (entry.visualType === "discoverer-portrait") {
    if (!entry.people?.length) fail(`${entry.answerId} portrait needs person metadata`);
    if (
      !entry.clues.some((clue) => clue?.afterIncorrectGuesses === 3 && clue.kind === "educational")
    )
      fail(`${entry.answerId} portrait needs an educational clue after three misses`);
  }
}

console.log(
  `Logo seed validation passed: ${entries.length} entries and ${paths.size} asset paths.`,
);
