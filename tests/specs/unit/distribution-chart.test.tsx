// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DistributionChart } from "../../../src/app/components/ui/DistributionChart";

describe("DistributionChart", () => {
  it("aggregates timeline submissions from eight upwards into 8+", () => {
    render(
      createElement(DistributionChart, {
        attemptTerm: "submissions",
        attemptTermSingular: "submission",
        buckets: ["1", "2", "3", "4", "5", "6", "7", "8+"],
        distribution: { "1": 1, "8": 1, "9": 1, "10+": 1 },
      }),
    );

    expect(screen.getAllByRole("progressbar")).toHaveLength(8);
    expect(
      screen.getByRole("progressbar", { name: "3 wins in 8+ submissions" }),
    ).toBeInTheDocument();
  });
});
