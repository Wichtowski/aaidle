import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncTimelineSeed } from "../../../scripts/timeline-seed-constants.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true });
});

describe("Timeline seed synchronization", () => {
  it("preserves custom events and rebuilds dated models from the Classic seed", () => {
    const directory = mkdtempSync(join(tmpdir(), "aaidle-timeline-seed-"));
    temporaryDirectories.push(directory);
    const classicPath = join(directory, "classic.seed.json");
    const timelinePath = join(directory, "timeline.seed.json");
    writeFileSync(
      classicPath,
      JSON.stringify([
        {
          id: "dated-model",
          name: "Dated model",
          minPool: 1,
          provider: "Provider",
          categories: ["language-model"],
          releaseDate: "2025-02-03",
        },
        {
          id: "year-only-model",
          name: "Year only model",
          categories: ["language-model"],
          releaseDate: "2024",
        },
      ]),
    );
    writeFileSync(
      timelinePath,
      JSON.stringify([
        {
          id: "custom-event",
          kind: "event",
          name: "Custom event",
          minPool: 0,
          provider: "Independent",
          categories: ["language-model"],
          releaseDate: "2015-12-11",
          sourceUrl: "https://example.com/source",
        },
        {
          id: "stale-model",
          kind: "model",
          name: "Stale model",
          minPool: 0,
          provider: "Old provider",
          categories: ["filters"],
          releaseDate: "2020-01-01",
        },
      ]),
    );

    expect(syncTimelineSeed({ classicPath, timelinePath })).toBe(2);
    const firstOutput = readFileSync(timelinePath, "utf8");
    expect(JSON.parse(firstOutput)).toEqual([
      expect.objectContaining({ id: "custom-event", sourceUrl: "https://example.com/source" }),
      expect.objectContaining({ id: "dated-model", kind: "model", minPool: 1 }),
    ]);

    syncTimelineSeed({ classicPath, timelinePath });
    expect(readFileSync(timelinePath, "utf8")).toBe(firstOutput);
  });
});
