import { readFileSync } from "node:fs";

const source = process.argv[2] ?? "data/timeline.seed.json";
const items = JSON.parse(readFileSync(source, "utf8"));
const ids = new Set();

const fail = (message) => {
  throw new Error("Timeline seed: " + message);
};
const isReleaseDate = (value) => {
  if (typeof value !== "string") return false;
  if (/^\d{4}$/.test(value)) return value !== "0000";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

if (!Array.isArray(items)) fail("root must be an array");
for (const [index, item] of items.entries()) {
  if (!item || typeof item !== "object" || Array.isArray(item))
    fail("item " + index + " must be an object");
  if (typeof item.id !== "string" || !item.id || ids.has(item.id))
    fail("item " + index + " has an invalid or duplicate id");
  ids.add(item.id);
  if (!["model", "event"].includes(item.kind)) fail(item.id + " has an invalid kind");
  if (typeof item.name !== "string" || !item.name.trim()) fail(item.id + " needs a name");
  if (!isReleaseDate(item.releaseDate)) fail(item.id + " needs a YYYY or YYYY-MM-DD releaseDate");
  if (!Number.isInteger(item.minPool) || item.minPool < 0 || item.minPool > 2)
    fail(item.id + " has an invalid minPool");
  if (!Array.isArray(item.categories) || item.categories.length === 0)
    fail(item.id + " needs categories");
}
console.log("Timeline seed validation passed: " + items.length + " items.");
