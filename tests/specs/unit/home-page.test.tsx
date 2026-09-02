// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/layouts/AppPageLayout", () => ({
  AppPageLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import { HomePage } from "../../../src/app/pages/home/HomePage";

describe("HomePage", () => {
  it("renders disabled games without navigation", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    const disabledGame = screen.getByTestId("home-play-connections");

    expect(disabledGame).toHaveAttribute("aria-disabled", "true");
    expect(disabledGame).not.toHaveAttribute("href");
    expect(disabledGame).toHaveTextContent("In progress");
    expect(screen.getByTestId("home-play-logo")).toHaveAttribute("href", "/logo");
  });
});