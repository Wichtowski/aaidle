// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/layouts/AppPageLayout", () => ({
  AppPageLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import { ConnectionsPage } from "../../../src/app/pages/game/ConnectionsPage";

describe("ConnectionsPage", () => {
  it("shows that the game is under construction", () => {
    render(<ConnectionsPage />);

    expect(screen.getByRole("heading", { name: "In construction" })).toBeVisible();
    expect(screen.getByText("🏗️")).toHaveAttribute("aria-hidden", "true");
  });
});
