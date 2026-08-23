// @vitest-environment jsdom

import { createElement } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalHellMode } from "../../../src/app/components/ui/GlobalHellMode";

let hardcoreUnlocked = false;

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({
    hardcoreUnlocked,
    user: { id: "user-1" },
  }),
}));

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

afterEach(() => {
  document.documentElement.classList.remove("hell-mode");
  document.body.classList.remove("hell-mode");
  hardcoreUnlocked = false;
});

describe("GlobalHellMode", () => {
  it("does not enable Hell mode from stale browser storage without server access", () => {
    window.localStorage.setItem("aaidle:hell-mode:v1", "1");

    render(createElement(GlobalHellMode));

    expect(document.body.classList.contains("hell-mode")).toBe(false);
  });

  it("enables Hell mode only after the server confirms Hardcore access", () => {
    hardcoreUnlocked = true;
    window.localStorage.setItem("aaidle:hell-mode:v1", "1");

    render(createElement(GlobalHellMode));

    expect(document.body.classList.contains("hell-mode")).toBe(true);
  });
});
