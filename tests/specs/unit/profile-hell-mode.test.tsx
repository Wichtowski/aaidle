// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalProgress } from "../../../src/lib/storage/local-progress-schema";

const mocks = vi.hoisted(() => ({
  progress: null as LocalProgress | null,
  updateProgress: vi.fn(),
}));

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({
    hardcoreUnlocked: true,
    refreshHardcoreAccess: vi.fn(),
    user: { id: "user-1" },
  }),
}));

vi.mock("../../../src/lib/storage/use-local-progress", () => ({
  useLocalProgress: () => mocks.progress,
}));

vi.mock("../../../src/lib/storage/local-progress-store", () => ({
  updateProgress: mocks.updateProgress,
}));

vi.mock("../../../src/lib/api/client", () => ({
  apiClient: {
    progressHistory: vi.fn(() => new Promise(() => undefined)),
  },
}));

vi.mock("../../../src/lib/domain/games/timeline/timeline-progress-store", () => ({
  readSavedTimelineGames: () => [],
}));

vi.mock("../../../src/app/components/ui/SiteNavbar", () => ({
  SiteNavbar: () => null,
}));

vi.mock("../../../src/app/components/auth/ActivationPrompt", () => ({
  ActivationPrompt: () => null,
}));

vi.mock("../../../src/app/components/auth/ProfileDangerZone", () => ({
  ProfileDangerZone: () => null,
}));

vi.mock("../../../src/app/components/auth/UsernameForm", () => ({
  UsernameForm: () => null,
}));

vi.mock("../../../src/app/components/ui/DistributionChart", () => ({
  DistributionChart: () => null,
}));

import { ProfilePage } from "../../../src/app/pages/profile/ProfilePage";

describe("Profile Hell Mode", () => {
  beforeEach(() => {
    mocks.progress = {
      version: 1,
      playerId: crypto.randomUUID(),
      activeMode: "classic",
      games: {},
      stats: {
        classic: {
          currentStreak: 0,
          bestStreak: 0,
          gamesPlayed: 0,
          gamesWon: 0,
          lastPlayedDate: null,
          lastSolvedDate: null,
          guessDistribution: {},
        },
      },
      preferences: {
        reducedMotion: false,
        highContrast: false,
        hasSeenClassicPrivacy: false,
        hasSeenClassicHowToPlay: true,
        hardcoreUnlocked: true,
        innerCircleActive: false,
        hellMode: true,
        hasAutoplayedHardcoreSoundtrack: true,
      },
    };
    mocks.updateProgress.mockReset().mockImplementation((mutator) => {
      mocks.progress = mutator(mocks.progress!);
      return mocks.progress;
    });
  });

  afterEach(() => {
    document.body.classList.remove("profile-hell");
  });

  it("keeps Hell Mode enabled when changing Classic statistics category", () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(document.body.classList.contains("profile-hell")).toBe(true);
    expect(screen.getByTestId("profile-heading").closest("main")).toHaveClass("profile-page--hell");

    fireEvent.click(screen.getByRole("tab", { name: "CV" }));

    expect(mocks.updateProgress).not.toHaveBeenCalled();
    expect(document.body.classList.contains("profile-hell")).toBe(true);
    expect(screen.getByTestId("profile-heading").closest("main")).toHaveClass("profile-page--hell");
  });
});
