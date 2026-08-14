import { existsSync, readFileSync } from "node:fs";

const emojiSource = new URL("../data/emoji-game.seed.json", import.meta.url);
const modelSource = new URL("../data/models.seed.json", import.meta.url);
const pool = JSON.parse(readFileSync(emojiSource, "utf8"));
const models = JSON.parse(readFileSync(modelSource, "utf8"));
const MAX_SLOTS = 6;
const MIN_SLOTS = 3;
const MIN_CANDIDATES = 2;

function fail(message) {
  throw new Error(message);
}

function familyIdFor(model) {
  const slug = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  return model.family ? `${slug(model.provider ?? "Unknown")}-${slug(model.family)}` : null;
}

function assignments(slots, index = 0, selected = []) {
  if (index === slots.length) return [selected];
  const results = [];
  for (const emoji of slots[index].emojiCandidates) {
    if (!selected.includes(emoji)) results.push(...assignments(slots, index + 1, [...selected, emoji]));
  }
  return results;
}

const catalogFamilyIds = new Set(models.map(familyIdFor).filter(Boolean));
const familyIds = new Set();
const sequences = new Map();
const concepts = new Map();
const variants = [];
let assignmentCount = 0;

for (const puzzle of pool) {
  if (!puzzle || typeof puzzle !== "object") fail("Every Emoji pool entry must be an object.");
  if (typeof puzzle.familyId !== "string" || !puzzle.familyId) fail("Emoji pool entry has no familyId.");
  if (familyIds.has(puzzle.familyId)) fail(`Duplicate familyId: ${puzzle.familyId}`);
  familyIds.add(puzzle.familyId);
  if (!catalogFamilyIds.has(puzzle.familyId)) fail(`Unknown catalog familyId: ${puzzle.familyId}`);
  if (!Array.isArray(puzzle.variants) || puzzle.variants.length === 0) {
    fail(`${puzzle.familyId} must have at least one variant.`);
  }

  if (puzzle.logoHint) {
    const { assetKey, revealModes } = puzzle.logoHint;
    if (typeof assetKey !== "string" || !assetKey) fail(`${puzzle.familyId} has an invalid logo asset key.`);
    if (!Array.isArray(revealModes) || revealModes.some((mode) => mode !== "partial" && mode !== "full")) {
      fail(`${puzzle.familyId} has invalid logo reveal modes.`);
    }
    if (!existsSync(new URL(`../public/emoji-logos/${assetKey}.svg`, import.meta.url))) {
      fail(`${puzzle.familyId} references a missing logo asset: ${assetKey}`);
    }
  }

  for (const [variantIndex, variant] of puzzle.variants.entries()) {
    const { slots } = variant ?? {};
    if (!Array.isArray(slots) || slots.length < MIN_SLOTS || slots.length > MAX_SLOTS) {
      fail(`${puzzle.familyId} variant ${variantIndex} must contain ${MIN_SLOTS} to ${MAX_SLOTS} slots.`);
    }

    for (const [slotIndex, slot] of slots.entries()) {
      if (typeof slot?.concept !== "string" || !slot.concept.trim()) {
        fail(`${puzzle.familyId} variant ${variantIndex} slot ${slotIndex} has no concept.`);
      }
      if (!Array.isArray(slot.emojiCandidates) || slot.emojiCandidates.length < MIN_CANDIDATES) {
        fail(`${puzzle.familyId} variant ${variantIndex} slot ${slotIndex} needs at least ${MIN_CANDIDATES} candidates.`);
      }
      if (new Set(slot.emojiCandidates).size !== slot.emojiCandidates.length) {
        fail(`${puzzle.familyId} variant ${variantIndex} slot ${slotIndex} repeats a candidate.`);
      }
      concepts.set(slot.concept, (concepts.get(slot.concept) ?? 0) + 1);
    }

    const validAssignments = assignments(slots);
    if (validAssignments.length === 0) fail(`${puzzle.familyId} variant ${variantIndex} has no distinct emoji assignment.`);
    assignmentCount += validAssignments.length;
    const variantId = `${puzzle.familyId}#${variantIndex}`;
    variants.push({ id: variantId, familyId: puzzle.familyId, slots });

    for (const sequence of validAssignments) {
      const key = sequence.join("\u0000");
      const previous = sequences.get(key);
      if (previous && previous.familyId !== puzzle.familyId) {
        fail(`Collision: ${sequence.join(" ")} belongs to both ${previous.familyId} and ${puzzle.familyId}.`);
      }
      sequences.set(key, { familyId: puzzle.familyId, variantId });
    }
  }
}

const similarPairs = [];
for (let index = 0; index < variants.length; index += 1) {
  for (let compareIndex = index + 1; compareIndex < variants.length; compareIndex += 1) {
    const left = variants[index];
    const right = variants[compareIndex];
    if (left.familyId === right.familyId) continue;
    const sharedPositions = left.slots.reduce(
      (count, slot, slotIndex) => count + slot.emojiCandidates.filter((emoji) => right.slots[slotIndex]?.emojiCandidates.includes(emoji)).length,
      0,
    );
    if (sharedPositions >= 4) similarPairs.push(`${left.id} ↔ ${right.id} (${sharedPositions} overlapping position candidates)`);
  }
}

const reusedConcepts = [...concepts.entries()]
  .filter(([, count]) => count >= 3)
  .sort(([left], [right]) => left.localeCompare(right));

console.log(`Emoji pilot validation passed: ${pool.length} families, ${variants.length} variants, ${assignmentCount} distinct assignments.`);
console.log(`Exact cross-family sequence collisions: 0.`);
console.log(`High-similarity variant pairs: ${similarPairs.length}${similarPairs.length ? `\n- ${similarPairs.join("\n- ")}` : ""}`);
console.log(`Concepts used by 3+ variants: ${reusedConcepts.length}${reusedConcepts.length ? `\n- ${reusedConcepts.map(([concept, count]) => `${concept} (${count})`).join("\n- ")}` : ""}`);
