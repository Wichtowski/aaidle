import { describe, expect, it } from "vitest";
import {
  generateEmojiPuzzle,
  resolveDistinctEmoji,
  revealedEmoji,
  type EmojiClueSlot,
} from "../../src/lib/domain/games/emoji/prototype";

const overlappingSlots: EmojiClueSlot[] = [
  { concept: "first", emojiCandidates: ["🧠", "💡"] },
  { concept: "second", emojiCandidates: ["🧠", "🔍"] },
  { concept: "third", emojiCandidates: ["🔍", "⚙️"] },
];

describe("Emoji prototype", () => {
  it("resolves overlapping candidate arrays without duplicate emoji", () => {
    const result = resolveDistinctEmoji(overlappingSlots, "daily-seed");

    expect(result).not.toBeNull();
    expect(new Set(result).size).toBe(result?.length);
  });

  it("is deterministic for immutable daily challenge input", () => {
    const input = { date: "2026-08-14", challengeSeed: "secret" };

    expect(generateEmojiPuzzle(input)).toEqual(generateEmojiPuzzle(input));
  });

  it("reveals stable progressive prefixes only", () => {
    const puzzle = generateEmojiPuzzle({ date: "2026-08-14", challengeSeed: "secret" });

    expect(revealedEmoji(puzzle, 2)).toEqual(puzzle.emoji.slice(0, 2));
    expect(revealedEmoji(puzzle, 3)).toEqual(puzzle.emoji.slice(0, 3));
    expect(revealedEmoji(puzzle, 4)).toEqual(puzzle.emoji.slice(0, 4));
    expect(revealedEmoji(puzzle, 5)).toEqual(puzzle.emoji.slice(0, 5));
    expect(revealedEmoji(puzzle, 6)).toEqual(puzzle.emoji.slice(0, 6));
  });

  it("rejects reveal counts outside the progressive schedule", () => {
    const puzzle = generateEmojiPuzzle({ date: "2026-08-14", challengeSeed: "secret" });

    expect(() => revealedEmoji(puzzle, 1)).toThrow("Emoji reveal count");
  });
});
