import emojiSeed from "../../../../data/emoji-game.seed.json";

export const emojiRevealCounts = [2, 3, 4, 5, 6] as const;
export const emojiInitialRevealCount = emojiRevealCounts[0];
export const emojiMaximumClueCount = emojiRevealCounts.at(-1)!;

export type EmojiClueSlot = {
  concept: string;
  emojiCandidates: string[];
};

export type EmojiClueVariant = {
  slots: EmojiClueSlot[];
};

export type EmojiLogoHint = {
  assetKey: string;
  revealModes: Array<"partial" | "full">;
};

export type EmojiFamilyPuzzle = {
  familyId: string;
  variants: EmojiClueVariant[];
  logoHint?: EmojiLogoHint;
};

export type ResolvedEmojiPuzzle = {
  familyId: string;
  variantIndex: number;
  emoji: string[];
  logoHint?: EmojiLogoHint;
};

export const emojiPilotPool = emojiSeed as EmojiFamilyPuzzle[];

function seedToUint32(seed: string): number {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function seededOrder<T>(values: readonly T[], seed: string): T[] {
  let state = seedToUint32(seed);
  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  return values
    .map((value, index) => ({ value, rank: next(), index }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ value }) => value);
}

/** Resolves all slots together so overlapping candidate arrays cannot repeat an emoji. */
export function resolveDistinctEmoji(
  slots: readonly EmojiClueSlot[],
  seed: string,
): string[] | null {
  const choose = (slotIndex: number, selected: string[]): string[] | null => {
    if (slotIndex === slots.length) return selected;

    for (const emoji of seededOrder(slots[slotIndex].emojiCandidates, `${seed}:${slotIndex}`)) {
      if (selected.includes(emoji)) continue;
      const result = choose(slotIndex + 1, [...selected, emoji]);
      if (result) return result;
    }

    return null;
  };

  return choose(0, []);
}

export function generateEmojiPuzzle({
  date,
  challengeSeed,
  pool = emojiPilotPool,
}: {
  date: string;
  challengeSeed: string;
  pool?: readonly EmojiFamilyPuzzle[];
}): ResolvedEmojiPuzzle {
  if (pool.length === 0) throw new Error("Emoji puzzle pool cannot be empty.");

  const family = seededOrder(pool, `${challengeSeed}:${date}:family`)[0];
  const variants = seededOrder(
    family.variants,
    `${challengeSeed}:${date}:${family.familyId}:variant`,
  );

  for (const variant of variants) {
    const variantIndex = family.variants.indexOf(variant);
    const emoji = resolveDistinctEmoji(
      variant.slots,
      `${challengeSeed}:${date}:${family.familyId}:${variantIndex}`,
    );
    if (emoji) return { familyId: family.familyId, variantIndex, emoji, logoHint: family.logoHint };
  }

  throw new Error(`No distinct emoji assignment exists for ${family.familyId}.`);
}

export function revealedEmoji(puzzle: ResolvedEmojiPuzzle, count: number): string[] {
  if (!emojiRevealCounts.includes(count as (typeof emojiRevealCounts)[number])) {
    throw new Error(`Emoji reveal count must be one of ${emojiRevealCounts.join(", ")}.`);
  }

  return puzzle.emoji.slice(0, count);
}
