// @vitest-environment jsdom

import { createElement, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassicPage } from "../../../src/app/pages/game/ClassicPage";

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({ hardcoreUnlocked: true, user: { id: "user-1" } }),
}));

vi.mock("../../../src/app/components/game/classic/ClassicGame", () => ({
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

function LocationProbe() {
  return createElement("p", null, useLocation().pathname);
}

describe("ClassicPage navigation", () => {
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
  afterEach(() => window.localStorage.clear());

  it("canonicalizes a saved Hardcore game to the Hardcore route", async () => {
    window.localStorage.setItem(
      "aaidle:game-preferences:v1",
      JSON.stringify({ classic: { category: "hardcore", difficulty: "hardcore" } }),
    );

    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/classic"] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/classic", element: createElement(ClassicPage) }),
          createElement(Route, {
            path: "/classic/hardcore",
            element: createElement(
              "div",
              null,
              createElement(ClassicPage),
              createElement(LocationProbe),
            ),
          }),
        ),
      ),
    );

    expect(await screen.findByText("/classic/hardcore")).toBeTruthy();
  });

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
