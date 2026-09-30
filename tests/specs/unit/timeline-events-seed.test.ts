import { expect, it } from "vitest";
import events from "../../../data/timeline/events.seed.json";
import timeline from "../../../data/timeline.seed.json";

it("preserves event dates, milestone annotations and sources in the combined Timeline seed", () => {
  expect(timeline.filter((item) => item.kind === "event")).toEqual(
    [...events].sort(
      (left, right) =>
        left.releaseDate.localeCompare(right.releaseDate) || left.id.localeCompare(right.id),
    ),
  );
});
