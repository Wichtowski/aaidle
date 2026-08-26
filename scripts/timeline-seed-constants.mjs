import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function syncTimelineSeed({
  classicPath = "data/classic.seed.json",
  timelinePath = "data/timeline.seed.json",
} = {}) {
  const resolvedClassicPath = resolve(classicPath);
  const resolvedTimelinePath = resolve(timelinePath);
  const classicModels = JSON.parse(readFileSync(resolvedClassicPath, "utf8"));
  const existingItems = existsSync(resolvedTimelinePath)
    ? JSON.parse(readFileSync(resolvedTimelinePath, "utf8"))
    : [];

  if (!Array.isArray(classicModels)) {
    throw new Error(`${resolvedClassicPath} must contain a JSON array`);
  }
  if (!Array.isArray(existingItems)) {
    throw new Error(`${resolvedTimelinePath} must contain a JSON array`);
  }

  const events = existingItems.filter((item) => item?.kind === "event");
  const models = classicModels
    .filter((model) => isFullIsoDate(model.releaseDate))
    .map((model) => ({
      id: model.id,
      kind: "model",
      name: model.name,
      minPool: Math.max(0, Math.min(2, model.minPool ?? 0)),
      provider: model.provider ?? "Unknown",
      categories: model.categories,
      releaseDate: model.releaseDate,
    }));
  const items = [...events, ...models].sort(
    (left, right) =>
      left.releaseDate.localeCompare(right.releaseDate) || left.id.localeCompare(right.id),
  );
  validateTimelineItems(items, resolvedTimelinePath);
  writeFileSync(resolvedTimelinePath, `${JSON.stringify(items, null, 2)}\n`);
  return items.length;
}

function validateTimelineItems(items, path) {
  const seenIds = new Set();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${path} contains an invalid item at index ${index}`);
    }
    if (typeof item.id !== "string" || seenIds.has(item.id)) {
      throw new Error(`${path} contains an invalid or duplicate ID at index ${index}`);
    }
    seenIds.add(item.id);
    if (!isFullIsoDate(item.releaseDate)) {
      throw new Error(`${item.id} does not have a verified full ISO release date`);
    }
    if (!Array.isArray(item.categories) || item.categories.length === 0) {
      throw new Error(`${item.id} must have at least one eligible category`);
    }
    if (!Number.isInteger(item.minPool) || item.minPool < 0 || item.minPool > 2) {
      throw new Error(`${item.id} has an invalid minPool`);
    }
    if (!matchesKind(item.kind)) throw new Error(`${item.id} has an invalid kind`);
  }
}

function matchesKind(value) {
  return value === "model" || value === "event";
}

function isFullIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
