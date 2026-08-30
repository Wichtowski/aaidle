// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => navigate };
});

import { BackButton } from "../../../src/app/components/ui/BackButton";

describe("BackButton", () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  it("returns to the previous router location when history is available", () => {
    window.history.replaceState({ idx: 2 }, "");
    render(<BackButton />);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it("falls back to the homepage after a direct visit", () => {
    window.history.replaceState({ idx: 0 }, "");
    render(<BackButton />);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
