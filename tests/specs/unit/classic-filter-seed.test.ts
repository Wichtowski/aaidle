import { describe, expect, it } from "vitest";
import filters from "../../../data/classic/classic.filters.seed.json";
import classic from "../../../data/classic.seed.json";
import timeline from "../../../data/timeline.seed.json";

describe("Classic filter seed", () => {
  it("keeps verified clues and dated Timeline entries synchronized", () => {
    expect(new Set(filters.map((entry) => entry.id)).size).toBe(35);

    for (const entry of filters) {
      expect(classic.find((model) => model.id === entry.id)).toMatchObject(entry);
      expect(entry.categoryDetails.filters.outputTypes).toEqual(entry.outputModalities);
      expect(entry.releaseDate === null || /^\d{4}$/.test(entry.releaseDate)).toBe(true);
      expect(entry.provider).not.toBe("Image processing");

      const item = timeline.find((model) => model.id === entry.id);
      if (entry.releaseDate === null) {
        expect(item).toBeUndefined();
      } else {
        expect(item).toMatchObject({
          kind: "model",
          name: entry.name,
          minPool: entry.minPool,
          provider: entry.provider ?? "Unknown",
          categories: entry.categories,
          releaseDate: entry.releaseDate,
        });
      }
    }

    for (const [id, year] of Object.entries({
      "hough-line-transform": "1959",
      "morphological-opening": "1967",
      "morphological-gradient": "1977",
      "local-binary-pattern": "1994",
      "fast-corner-detector": "2005",
    })) {
      expect(filters.find((entry) => entry.id === id)?.releaseDate).toBe(year);
    }

    const hog = filters.find((entry) => entry.id === "hog")!;
    expect(hog.categoryDetails.filters.kernelSizes).toEqual(["1x3", "3x1"]);
    const laplacian = filters.find((entry) => entry.id === "laplacian-operator")!;
    expect(laplacian.outputModalities).toEqual(["filter-response"]);
    const grabcut = filters.find((entry) => entry.id === "grabcut")!;
    expect(grabcut.categoryDetails.filters.requiresTraining).toBe(true);
    expect(grabcut.categoryDetails.filters.frameworks).toEqual(["opencv"]);
  });
});
