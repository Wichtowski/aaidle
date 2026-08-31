// @vitest-environment jsdom

import { createElement, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassicPage } from "../../../src/app/pages/game/ClassicPage";
import { ClassicCategoryNav } from "../../../src/app/components/game/classic/controls/ClassicCategoryNav";

const authState = vi.hoisted(() => ({
  hardcoreAccessLoading: false,
  hardcoreUnlocked: true,
  loading: false,
  user: { id: "user-1" } as { id: string } | null,
}));

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("../../../src/lib/storage/use-local-progress", () => ({
  useLocalProgress: () => ({ preferences: { innerCircleActive: false } }),
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

function CategoryNavigationHarness() {
  const navigate = useNavigate();
  const { category = "llm" } = useParams();
  return createElement(
    "div",
    null,
    createElement(ClassicCategoryNav, { category: category as "llm" }),
    createElement("button", { onClick: () => navigate(-1), type: "button" }, "Go back"),
    createElement(LocationProbe),
  );
}

describe("ClassicPage navigation", () => {
  beforeEach(() => {
    authState.hardcoreAccessLoading = false;
    authState.hardcoreUnlocked = true;
    authState.loading = false;
    authState.user = { id: "user-1" };
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

  it("opens the regular Classic game for signed-out visitors with a saved Hardcore game", () => {
    authState.hardcoreUnlocked = false;
    authState.user = null;
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
          createElement(Route, {
            path: "/classic",
            element: createElement(
              "div",
              null,
              createElement(ClassicPage),
              createElement(LocationProbe),
            ),
          }),
          createElement(Route, {
            path: "/classic/hardcore",
            element: createElement(LocationProbe),
          }),
        ),
      ),
    );

    expect(screen.getByText("llm:normal")).toBeTruthy();
    expect(screen.getByText("/classic")).toBeTruthy();
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

  it("does not add Classic category changes to navigation history", () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/profile", "/classic/llm"], initialIndex: 1 },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/profile", element: createElement(LocationProbe) }),
          createElement(Route, {
            path: "/classic/:category",
            element: createElement(CategoryNavigationHarness),
          }),
        ),
      ),
    );

    fireEvent.click(screen.getByRole("link", { name: "Filters" }));
    expect(screen.getByText("/classic/filters")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByText("/profile")).toBeTruthy();
  });
});
