import { describe, it, expect } from "vitest";
import { selectDailyModel } from "../../lib/domain/challenges/daily-selector";
import { NoEligibleModelsError } from "../../lib/domain/challenges/challenge-types";
const models = [{ id: "a" }, { id: "b" }, { id: "c" }];
describe("daily selector", () => {
  it("is deterministic regardless of input order", async () => {
    const a = await selectDailyModel({ date: "2026-08-11", mode: "classic", secret: "s", models });
    const b = await selectDailyModel({
      date: "2026-08-11",
      mode: "classic",
      secret: "s",
      models: [...models].reverse(),
    });
    expect(a.id).toBe(b.id);
  });
  it("excludes yesterday when alternatives exist", async () =>
    expect(
      (
        await selectDailyModel({
          date: "2026-08-11",
          mode: "classic",
          secret: "s",
          models,
          recentlyUsed: ["a"],
        })
      ).id,
    ).not.toBe("a"));
  it("falls back for small pools", async () =>
    expect(
      (
        await selectDailyModel({
          date: "2026-08-11",
          mode: "classic",
          secret: "s",
          models: [{ id: "a" }],
          recentlyUsed: ["a"],
        })
      ).id,
    ).toBe("a"));
  it("rejects empty pools", async () =>
    await expect(
      selectDailyModel({ date: "2026-08-11", mode: "classic", secret: "s", models: [] }),
    ).rejects.toBeInstanceOf(NoEligibleModelsError));
});
