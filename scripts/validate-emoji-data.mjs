import { readFileSync } from "node:fs";

const source = new URL("../data/emoji.seed.json", import.meta.url);
const pool = JSON.parse(readFileSync(source, "utf8"));
const iconKeys = new Set(["keyboard-alt", "meta", "alibaba", "moon", "bird", "windows", "ibm", "point-cloud", "projection-axis"]);
const entityKinds = new Set(["emoji", "architecture", "algorithm", "operator"]);
const categories = new Set(["language-model", "computer-vision", "nlp", "object-detection", "classical-ml", "image-processing", "neural-network", "other"]);
const normalize = (value) => value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "").trim();
const fail = (message) => { throw new Error(`Emoji seed: ${message}`); };
const entityIds = new Set();
const answers = new Map();
for (const entity of pool) {
  if (!entity || typeof entity !== "object") fail("each entity must be an object");
  if (typeof entity.id !== "string" || !entity.id) fail("entity has an invalid id");
  if (entityIds.has(entity.id)) fail(`duplicate entity id ${entity.id}`);
  entityIds.add(entity.id);
  if (typeof entity.name !== "string" || !entity.name.trim()) fail(`${entity.id} needs a name`);
  if (!entityKinds.has(entity.entityKind)) fail(`${entity.id} has invalid entityKind`);
  if (![0, 1, 2].includes(entity.minPool)) fail(`${entity.id} has invalid minPool`);
  if (!Array.isArray(entity.categories) || !entity.categories.length || entity.categories.some((category) => !categories.has(category))) fail(`${entity.id} has invalid categories`);
  if (entity.minPool === 0 && !entity.categories.includes("language-model")) fail(`${entity.id}: Normal entries must be language-models`);
  const names = [entity.name, ...(entity.aliases ?? [])];
  if (!names.some((value) => typeof value === "string" && value.trim())) fail(`${entity.id} needs a name or alias`);
  for (const answer of names) {
    const key = normalize(answer);
    if (!key) fail(`${entity.id} has an empty normalized answer`);
    if (answers.has(key) && answers.get(key) !== entity.id) fail(`answer alias ${answer} belongs to both ${answers.get(key)} and ${entity.id}`);
    answers.set(key, entity.id);
  }
  if (!Array.isArray(entity.variants) || !entity.variants.length) fail(`${entity.id} needs a variant`);
  const variants = new Set(); const sequences = new Set();
  for (const variant of entity.variants) {
    if (typeof variant?.id !== "string" || !variant.id || variants.has(variant.id)) fail(`${entity.id} has duplicate/invalid variant id`);
    variants.add(variant.id);
    if (!Number.isInteger(variant.weight) || variant.weight <= 0) fail(`${entity.id}/${variant.id} has non-positive weight`);
    if (![0, 1, 2].includes(variant.minPool) || variant.minPool < entity.minPool) fail(`${entity.id}/${variant.id} has invalid minPool`);
    if (variant.revealMode && !["progressive", "all-at-once"].includes(variant.revealMode)) fail(`${entity.id}/${variant.id} has invalid revealMode`);
    if (!Array.isArray(variant.clues) || variant.clues.length < 2) fail(`${entity.id}/${variant.id} needs at least two clues`);
    const sequence = variant.clues.map((clue) => {
      if (clue?.type === "emoji" && typeof clue.value === "string" && clue.value) return `emoji:${clue.value}`;
      if (clue?.type === "icon" && typeof clue.icon === "string" && iconKeys.has(clue.icon)) return `icon:${clue.icon}`;
      fail(`${entity.id}/${variant.id} has an unsupported clue or icon`);
    }).join("|");
    if (sequences.has(sequence)) fail(`${entity.id} has duplicate visual sequences`);
    sequences.add(sequence);
  }
}
console.log(`Emoji seed validation passed: ${pool.length} entities and ${answers.size} normalized answers.`);
