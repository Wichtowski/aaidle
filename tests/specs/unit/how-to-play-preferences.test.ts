// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  hasSeenClassicHowToPlay,
  markClassicHowToPlaySeen,
} from "../../../src/lib/storage/how-to-play-preferences";

describe("How To Play preferences", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  it("remembers dismissal separately for each Classic game", () => {
    expect(hasSeenClassicHowToPlay("llm", "normal", false)).toBe(false);

    markClassicHowToPlaySeen("llm", "normal");

    expect(hasSeenClassicHowToPlay("llm", "normal", false)).toBe(true);
    expect(hasSeenClassicHowToPlay("cv", "normal", false)).toBe(false);
    expect(hasSeenClassicHowToPlay("llm", "challenge", false)).toBe(false);
  });

  it("honors the existing one-time Classic preference", () => {
    expect(hasSeenClassicHowToPlay("llm", "normal", true)).toBe(true);
  });
});
