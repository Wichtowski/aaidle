// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyCountdown } from "../../../src/app/components/game/common/layout/DailyCountdown";

describe("DailyCountdown", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reloads once when the challenge expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T00:00:00.000Z"));
    const onExpiry = vi.fn();

    render(
      createElement(DailyCountdown, {
        expiresAt: "2026-08-12T00:00:01.000Z",
        onExpiry,
      }),
    );

    expect(onExpiry).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(3000));

    expect(onExpiry).toHaveBeenCalledTimes(1);
  });
});
