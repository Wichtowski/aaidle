import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Logo seed validation", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "aaidle-logo-seed-"));
    mkdirSync(join(directory, "scripts"));
    mkdirSync(join(directory, "data"));
    mkdirSync(join(directory, "public/logo-visual"), { recursive: true });
    cpSync("scripts/validate-logo-data.mjs", join(directory, "scripts/validate-logo-data.mjs"));
    for (let index = 0; index < 6; index++) {
      writeFileSync(join(directory, `public/logo-visual/${index}.png`), "fixture");
    }
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  function validate(clues: unknown[], profile: Record<string, unknown> = {}) {
    const entries = Array.from({ length: 6 }, (_, index) => ({
      answerId: `answer-${index}`,
      minPool: 0,
      visualType: "technology",
      assetName: `Answer ${index}`,
      assetUrl: `/logo-visual/${index}.png`,
      revealProfile: "progressive-zoom",
      focalPoint: { x: 256, y: 256 },
      clues,
      ...profile,
    }));
    writeFileSync(join(directory, "data/logo.seed.json"), JSON.stringify(entries));
    return execFileSync(process.execPath, [join(directory, "scripts/validate-logo-data.mjs")], {
      stdio: "pipe",
    }).toString();
  }

  it("accepts immediate text and image clues", () => {
    expect(
      validate([
        { afterIncorrectGuesses: 0, kind: "general", text: "Initial clue" },
        { afterIncorrectGuesses: 0, kind: "image", assetUrl: "/logo-visual/0.png" },
      ]),
    ).toContain("validation passed");
  });

  it("accepts Gaussian blur without a focal point and rejects invalid settings", () => {
    const clues = [{ afterIncorrectGuesses: 0, kind: "general", text: "Hint" }];
    const profile = {
      revealProfile: "gaussian-blur",
      focalPoint: undefined,
      blurStartStrength: 28,
      blurStepStrength: 4,
    };
    expect(validate(clues, profile)).toContain("validation passed");
    for (const field of ["blurStartStrength", "blurStepStrength"]) {
      for (const value of [undefined, 0, -1, 65, "4", null]) {
        expect(() => validate(clues, { ...profile, [field]: value })).toThrow();
      }
    }
    expect(() =>
      validate(clues, { revealProfile: "progressive-zoom", focalPoint: undefined }),
    ).toThrow();
    expect(() => validate(clues, { revealProfile: "unknown" })).toThrow();
  });

  it("rejects invalid thresholds and incomplete clues even after a valid clue", () => {
    const valid = { afterIncorrectGuesses: 0, kind: "general", text: "Initial clue" };
    for (const clue of [
      { ...valid, afterIncorrectGuesses: -1 },
      { ...valid, afterIncorrectGuesses: 0.5 },
      { ...valid, afterIncorrectGuesses: "0" },
      {},
      { ...valid, text: "" },
      { ...valid, kind: "" },
      { afterIncorrectGuesses: 0, kind: "image" },
      { afterIncorrectGuesses: 0, kind: "image", asset: "../secret.png" },
      { afterIncorrectGuesses: 0, kind: "image", asset: "missing.png" },
    ])
      expect(() => validate([valid, clue])).toThrow();
    expect(() => validate([{ ...valid, afterIncorrectGuesses: 3 }, valid])).toThrow();
  });
});
