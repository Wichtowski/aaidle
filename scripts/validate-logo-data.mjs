import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = new URL("../data/logo.seed.json", import.meta.url);
const entries = JSON.parse(readFileSync(source, "utf8"));
const privateRoot = fileURLToPath(new URL("../private/logo-assets/", import.meta.url));
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const visualTypes = new Set(["logo", "discoverer-portrait", "technology", "other"]);
const fail = (message) => {
  throw new Error(`Logo seed: ${message}`);
};

const normalizeAsset = (value) =>
  typeof value === "string" && value && !value.startsWith("/") ? `/logo-visual/${value}` : value;
const validAsset = (value) =>
  typeof value === "string" &&
  /^\/(?!\/)[A-Za-z0-9/_.-]+\.(png|webp)$/.test(value) &&
  !value.includes("..");
const privateAssetExists = (assetPath) => {
  try {
    return statSync(new URL(`../private/logo-assets${assetPath}`, import.meta.url)).isFile();
  } catch {
    return false;
  }
};
const imageHash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const publicImageHashes = new Set();
const collectPublicImageHashes = (directory) => {
  let directoryEntries;
  try {
    directoryEntries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of directoryEntries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectPublicImageHashes(path);
    else if (entry.isFile() && /\.(png|webp)$/i.test(entry.name)) publicImageHashes.add(imageHash(path));
  }
};
collectPublicImageHashes(publicRoot);

if (!Array.isArray(entries) || entries.length < 6) fail("at least six entries are required");
const answers = new Set();
const paths = new Set();
const privateAssets = new Set();
for (const entry of entries) {
  if (!entry || typeof entry !== "object") fail("each entry must be an object");
  if (typeof entry.answerId !== "string" || !entry.answerId) fail("entry has an invalid answerId");
  if (answers.has(entry.answerId)) fail(`duplicate answerId ${entry.answerId}`);
  answers.add(entry.answerId);
  if (![0, 1, 2].includes(entry.minPool)) fail(`${entry.answerId} has invalid minPool`);
  if (!visualTypes.has(entry.visualType)) fail(`${entry.answerId} has invalid visualType`);
  if (typeof entry.assetName !== "string" || !entry.assetName.trim())
    fail(`${entry.answerId} needs an assetName`);
  const assetPath = normalizeAsset(entry.assetUrl ?? entry.assetPath ?? entry.asset);
  if (!validAsset(assetPath))
    fail(`${entry.answerId} needs a root-relative private PNG/WebP assetUrl`);
  if (paths.has(assetPath)) fail(`duplicate asset ${assetPath}`);
  paths.add(assetPath);
  if (!privateAssetExists(assetPath))
    fail(`${entry.answerId} is missing private asset ${assetPath}`);
  privateAssets.add(assetPath);
  if (entry.revealProfile === null) {
    // A null profile serves the source image without any reveal processing.
  } else if (entry.revealProfile === "progressive-zoom") {
    if (
      !Number.isFinite(entry.focalPoint?.x) ||
      !Number.isFinite(entry.focalPoint?.y) ||
      entry.focalPoint.x < 0 ||
      entry.focalPoint.x > 512 ||
      entry.focalPoint.y < 0 ||
      entry.focalPoint.y > 512
    )
      fail(`${entry.answerId} has an invalid focalPoint`);
  } else if (entry.revealProfile === "gaussian-blur") {
    for (const field of ["blurStartStrength", "blurStepStrength"]) {
      if (!Number.isFinite(entry[field]) || entry[field] <= 0 || entry[field] > 64)
        fail(`${entry.answerId} needs ${field} greater than 0 and at most 64`);
    }
  } else {
    fail(`${entry.answerId} has an invalid revealProfile`);
  }
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
  let previousThreshold = 0;
  for (const clue of entry.clues) {
    if (
      !Number.isSafeInteger(clue?.afterIncorrectGuesses) ||
      clue.afterIncorrectGuesses < previousThreshold ||
      typeof clue.kind !== "string" ||
      !clue.kind.trim() ||
      (clue.kind !== "image" && (typeof clue.text !== "string" || !clue.text.trim()))
    )
      fail(`${entry.answerId} has an invalid clue (thresholds must be nonnegative and ordered)`);
    if (clue.kind === "image") {
      const asset = normalizeAsset(clue.assetUrl ?? clue.asset);
      if (!validAsset(asset) || !privateAssetExists(asset))
        fail(`${entry.answerId} image clue needs an existing private assetUrl`);
      privateAssets.add(asset);
    }
    previousThreshold = clue.afterIncorrectGuesses;
  }
  if (entry.visualType === "discoverer-portrait") {
    if (!entry.people?.length) fail(`${entry.answerId} portrait needs person metadata`);
    if (
      !entry.clues.some((clue) => clue?.afterIncorrectGuesses === 3 && clue.kind === "educational")
    )
      fail(`${entry.answerId} portrait needs an educational clue after three misses`);
  }
}

for (const asset of privateAssets) {
  if (publicImageHashes.has(imageHash(join(privateRoot, asset))))
    fail(`private asset ${asset} is also published by the frontend`);
}

console.log(
  `Logo seed validation passed: ${entries.length} entries and ${paths.size} asset paths.`,
);
