// @vitest-environment jsdom

import { createElement, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ClassicPage from "../../../src/app/pages/ClassicPage";

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({ hardcoreUnlocked: true, user: { id: "user-1" } }),
}));

vi.mock("../../../src/app/components/game/ClassicGame", () => ({
  ClassicGame: ({ category, difficulty }: { category: string; difficulty: string }) => {
    const [selectedDifficulty] = useState(difficulty);
    return createElement("p", null, `${category}:${selectedDifficulty}`);
  },
}));

function ChangeCategory() {
  const navigate = useNavigate();
  return createElement(
    "button",
    { onClick: () => navigate("/classic/filters"), type: "button" },
    "Open filters",
  );
}

describe("ClassicPage navigation", () => {
  it("resets Hardcore difficulty when moving to a regular category", () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/classic/hardcore"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/classic/:category",
            element: createElement(
              "div",
              null,
              createElement(ChangeCategory),
              createElement(ClassicPage),
            ),
          }),
        ),
      ),
    );

    expect(screen.getByText("hardcore:hardcore")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));
    expect(screen.getByText("filters:normal")).toBeTruthy();
  });
});
