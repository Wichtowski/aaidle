// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HardcoreSoundtrackStatus } from "../../../src/app/components/admin/HardcoreSoundtrackStatus";
import { HardcoreSoundtrack } from "../../../src/app/components/game/classic/hardcore/HardcoreSoundtrack";
import {
  buildHardcoreSoundtrackCatalog,
  dailyHardcoreSoundtrack,
} from "../../../src/lib/media/hardcore-soundtracks";

const mocks = vi.hoisted(() => ({
  play: vi.fn<() => Promise<void>>(),
  pause: vi.fn(),
  readProgress: vi.fn(),
  updateProgress: vi.fn(),
}));

vi.mock("virtual:hardcore-soundtracks", () => ({
  default: [
    {
      audioFileNames: [
        "The-only-thing-they-fear-is--Mick-Gordon.ogg",
        "The-only-thing-they-fear-is--Mick-Gordon.mp3",
      ],
      baseName: "The-only-thing-they-fear-is--Mick-Gordon",
      coverFileName: "The-only-thing-they-fear-is--Mick-Gordon.webp",
    },
  ],
}));

vi.mock("../../../src/lib/storage/local-progress-store", () => ({
  readProgress: mocks.readProgress,
  updateProgress: mocks.updateProgress,
}));

describe("Hardcore soundtrack catalog", () => {
  it("derives OGG and MP3 sources with paired public URLs from filenames", () => {
    expect(
      buildHardcoreSoundtrackCatalog([
        {
          audioFileNames: ["The-only-thing--Mick-Gordon.ogg", "The-only-thing--Mick-Gordon.mp3"],
          baseName: "The-only-thing--Mick-Gordon",
          coverFileName: "The-only-thing--Mick-Gordon.webp",
        },
      ]),
    ).toEqual([
      {
        artist: "Mick Gordon",
        audioSources: [
          {
            fileName: "The-only-thing--Mick-Gordon.ogg",
            mimeType: "audio/ogg",
            url: "/hardcore/audio/The-only-thing--Mick-Gordon.ogg",
          },
          {
            fileName: "The-only-thing--Mick-Gordon.mp3",
            mimeType: "audio/mpeg",
            url: "/hardcore/audio/The-only-thing--Mick-Gordon.mp3",
          },
        ],
        coverUrl: "/hardcore/cover/The-only-thing--Mick-Gordon.webp",
        title: "The only thing",
      },
    ]);
  });

  it("selects one stable track for a UTC date", () => {
    const catalog = buildHardcoreSoundtrackCatalog([
      {
        audioFileNames: ["First--Artist.ogg"],
        baseName: "First--Artist",
        coverFileName: "First--Artist.jpg",
      },
      {
        audioFileNames: ["Second--Artist.mp3"],
        baseName: "Second--Artist",
        coverFileName: "Second--Artist.png",
      },
    ]);

    expect(dailyHardcoreSoundtrack("2026-09-08", catalog)).toBe(
      dailyHardcoreSoundtrack("2026-09-08", catalog),
    );
    expect(dailyHardcoreSoundtrack("2026-09-08", [])).toBeNull();
  });
});

describe("HardcoreSoundtrack", () => {
  beforeEach(() => {
    mocks.play.mockReset().mockResolvedValue();
    mocks.pause.mockReset();
    mocks.readProgress.mockReset().mockReturnValue({
      preferences: { hasAutoplayedHardcoreSoundtrack: false },
    });
    mocks.updateProgress.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(mocks.play);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(mocks.pause);
  });

  it("uses native looping audio, both formats, paired cover, and retries autoplay", () => {
    render(<HardcoreSoundtrack />);

    const audio = screen.getByLabelText(/Hardcore soundtrack$/);
    expect(audio.tagName).toBe("AUDIO");
    expect(audio).toHaveAttribute("autoplay");
    expect(audio).toHaveAttribute("loop");
    expect(audio.querySelectorAll("source")).toHaveLength(2);
    expect(audio.querySelector('source[type="audio/ogg"]')).toHaveAttribute(
      "src",
      "/hardcore/audio/The-only-thing-they-fear-is--Mick-Gordon.ogg",
    );
    expect(audio.querySelector('source[type="audio/mpeg"]')).toHaveAttribute(
      "src",
      "/hardcore/audio/The-only-thing-they-fear-is--Mick-Gordon.mp3",
    );
    expect(screen.getByText("The only thing they fear is")).toBeInTheDocument();
    expect(screen.getByText("Mick Gordon")).toBeInTheDocument();
    const noticeLink = screen.getByRole("link", {
      name: "Open the aAIdle Hardcore soundtrack notice in a new tab",
    });
    expect(noticeLink).toHaveAttribute("href", "/hardcore/SOUNDTRACK-NOTICE.txt");
    expect(noticeLink).toHaveAttribute("target", "_blank");
    expect(noticeLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(noticeLink).not.toHaveAttribute("download");
    expect(mocks.play).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(document.body);
    expect(mocks.play).toHaveBeenCalledTimes(2);

    fireEvent.play(audio);
    fireEvent.pointerDown(document.body);
    expect(mocks.play).toHaveBeenCalledTimes(2);
    expect(mocks.updateProgress).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Mute soundtrack" }));
    expect(screen.getByRole("button", { name: "Unmute soundtrack" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows today's automatic selection in the admin panel", () => {
    render(<HardcoreSoundtrackStatus />);

    expect(screen.getByText("Today’s song")).toBeInTheDocument();
    expect(screen.getByText("The only thing they fear is")).toBeInTheDocument();
    expect(screen.getByText("Mick Gordon")).toBeInTheDocument();
    const noticeLink = screen.getByRole("link", {
      name: "Open the aAIdle Hardcore soundtrack notice in a new tab",
    });
    expect(noticeLink).toHaveAttribute("href", "/hardcore/SOUNDTRACK-NOTICE.txt");
    expect(noticeLink).toHaveAttribute("target", "_blank");
    expect(noticeLink).not.toHaveAttribute("download");
  });
});
