// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogoClues } from "../../../src/app/components/game/logo/LogoClues";
import { useLogoClueViews } from "../../../src/lib/storage/use-logo-clue-views";
import { logoClueSchema, logoProgressSchema } from "../../../src/lib/validation/api";

const clues = [
  { afterIncorrectGuesses: 0, kind: "general", text: "An immediately available hint." },
  {
    afterIncorrectGuesses: 3,
    kind: "image",
    text: "Timeline caption.",
    imageUrl: "/api/v1/games/logo/challenges/test/image?v=clue-1",
  },
];
function Harness({ player = "player", challenge = "today", available = clues }) {
  const { viewedClues, markViewed } = useLogoClueViews(player, challenge);
  return (
    <LogoClues
      key={`${player}:${challenge}`}
      clues={available}
      viewedClues={viewedClues}
      onView={markViewed}
    />
  );
}

describe("Logo clues", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        clear: () => values.clear(),
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("accepts immediate clues and rejects negative or fractional thresholds", () => {
    expect(logoClueSchema.safeParse(clues[0]).success).toBe(true);
    expect(logoClueSchema.parse(clues[1]).imageUrl).toBe(clues[1].imageUrl);
    for (const afterIncorrectGuesses of [-1, 0.5]) {
      expect(logoClueSchema.safeParse({ ...clues[0], afterIncorrectGuesses }).success).toBe(false);
    }
  });

  it("validates profile-specific API fields without requiring a blur focal point", () => {
    const base = {
      imageUrl: "/api/v1/games/logo/challenges/test/image?v=0",
      imageRevision: 0,
      maximumImageRevision: 7,
      clues: [],
      solved: false,
    };
    const blur = {
      ...base,
      revealProfile: "gaussian-blur",
      blurStartStrength: 28,
      blurStepStrength: 4,
    };
    expect(logoProgressSchema.parse(blur)).not.toHaveProperty("focalPoint");
    expect(
      logoProgressSchema.safeParse({
        ...base,
        revealProfile: "progressive-zoom",
        focalPoint: { x: 256, y: 256 },
      }).success,
    ).toBe(true);
    expect(
      logoProgressSchema.safeParse({ ...base, revealProfile: "progressive-zoom" }).success,
    ).toBe(false);
    expect(logoProgressSchema.safeParse({ ...blur, revealProfile: "unknown" }).success).toBe(false);
    for (const field of ["blurStartStrength", "blurStepStrength"]) {
      for (const value of [undefined, 0, -1, 65, Infinity, "4"]) {
        expect(logoProgressSchema.safeParse({ ...blur, [field]: value }).success).toBe(false);
      }
    }
  });

  it("opens using the keyboard, marks a clue viewed once, and remembers it after reload", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    expect(screen.queryByText(clues[0].text)).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Clue 1: general, available" });
    expect(button).not.toHaveAttribute("title", clues[0].text);
    button.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Clue 1" })).toBeInTheDocument();
    expect(screen.getByText(clues[0].text)).toBeVisible();
    expect(screen.getByText("Available from the start.")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(button).toHaveFocus();
    expect(button).toHaveClass("is-viewed");
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(JSON.parse(window.localStorage.getItem("aaidle:logo-clue-views:v1")!).indices).toEqual([
      0,
    ]);
    unmount();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Clue 1: general, viewed" })).toHaveClass(
      "is-viewed",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays newly available image clues and handles image failures", () => {
    const view = render(<Harness available={[clues[0]]} />);
    expect(screen.queryByRole("button", { name: /Clue 2/ })).not.toBeInTheDocument();
    view.rerender(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Clue 2: image, available" }));
    expect(screen.getByText("Timeline caption.")).toBeVisible();
    const image = screen.getByRole("img", { name: "Image for clue 2" });
    expect(image).toHaveAttribute("src", clues[1].imageUrl);
    fireEvent.error(image);
    expect(screen.getByText(/clue image could not be loaded/)).toBeVisible();
  });

  it("does not carry viewed clues into a different player or challenge", () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Clue 1/ }));
    view.rerender(<Harness challenge="tomorrow" />);
    expect(screen.getByRole("button", { name: "Clue 1: general, available" })).not.toHaveClass(
      "is-viewed",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.rerender(<Harness player="other-player" />);
    expect(screen.getByRole("button", { name: "Clue 1: general, available" })).not.toHaveClass(
      "is-viewed",
    );
  });

  it("tolerates corrupt or unavailable browser storage", () => {
    window.localStorage.setItem("aaidle:logo-clue-views:v1", "invalid json");
    render(<Harness />);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    fireEvent.click(screen.getByRole("button", { name: /Clue 1/ }));
    expect(screen.getByText(clues[0].text)).toBeVisible();
    expect(screen.getByRole("button", { name: /Clue 1: general, viewed/ })).toHaveClass(
      "is-viewed",
    );
  });
});
