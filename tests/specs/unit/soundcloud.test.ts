// @vitest-environment jsdom

import { createElement } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HardcoreSoundtrack } from "../../../src/app/components/game/classic/hardcore/HardcoreSoundtrack";
import { normalizeSoundCloudUrl } from "../../../src/lib/media/soundcloud";

const mocks = vi.hoisted(() => ({
  publicConfig: vi.fn(),
  readProgress: vi.fn(),
  updateProgress: vi.fn(),
}));

vi.mock("../../../src/lib/api/client", () => ({
  apiClient: { publicConfig: mocks.publicConfig },
}));

vi.mock("../../../src/lib/storage/local-progress-store", () => ({
  readProgress: mocks.readProgress,
  updateProgress: mocks.updateProgress,
}));

describe("normalizeSoundCloudUrl", () => {
  it("accepts a public HTTPS SoundCloud track URL", () => {
    expect(normalizeSoundCloudUrl("https://soundcloud.com/example/track")).toBe(
      "https://soundcloud.com/example/track",
    );
  });

  it("rejects non-SoundCloud and insecure URLs", () => {
    expect(normalizeSoundCloudUrl("https://example.com/track")).toBeNull();
    expect(normalizeSoundCloudUrl("http://soundcloud.com/example/track")).toBeNull();
  });
});

describe("HardcoreSoundtrack", () => {
  const trackUrl = "https://soundcloud.com/user-348797964/the-only-thing-they-fear-is";
  const listeners = new Map<string, () => void>();
  const widget = {
    bind: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    play: vi.fn(),
    setVolume: vi.fn(),
  };
  const Widget = Object.assign(vi.fn(() => widget), {
    Events: { PLAY: "play", READY: "ready" },
  });

  beforeEach(() => {
    listeners.clear();
    Widget.mockClear();
    widget.bind.mockClear();
    widget.play.mockClear();
    widget.setVolume.mockClear();
    mocks.publicConfig.mockReset().mockResolvedValue({ hardcoreSoundtrackUrl: trackUrl });
    mocks.readProgress.mockReset().mockReturnValue({
      preferences: { hasAutoplayedHardcoreSoundtrack: false },
    });
    mocks.updateProgress.mockReset();
    window.SC = { Widget };
  });

  it("eagerly requests autoplay and retries after user interaction", async () => {
    render(createElement(HardcoreSoundtrack));

    const iframe = await screen.findByTitle("Hardcore soundtrack from SoundCloud");
    const playerUrl = new URL(iframe.getAttribute("src") ?? "");
    expect(playerUrl.searchParams.get("url")).toBe(trackUrl);
    expect(playerUrl.searchParams.get("auto_play")).toBe("true");
    expect(iframe).toHaveAttribute("loading", "eager");
    await waitFor(() => expect(Widget).toHaveBeenCalledWith(iframe));

    act(() => listeners.get("ready")?.());
    expect(widget.setVolume).toHaveBeenCalledWith(25);
    expect(widget.play).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(document.body);
    expect(widget.play).toHaveBeenCalledTimes(2);

    act(() => listeners.get("play")?.());
    fireEvent.pointerDown(document.body);
    expect(widget.play).toHaveBeenCalledTimes(2);
  });
});
