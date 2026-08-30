// @vitest-environment jsdom

import { createElement } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalHellMode } from "../../../src/app/components/ui/GlobalHellMode";

let hardcoreUnlocked = false;
let hellMode = false;
let user: { id: string } | null = { id: "user-1" };
const hellModeActiveKey = "aaidle:hell-mode-active:v1";

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({
    hardcoreAccessLoading: false,
    hardcoreUnlocked,
    loading: false,
    user,
  }),
}));

vi.mock("../../../src/lib/storage/use-local-progress", () => ({
  useLocalProgress: () => ({ preferences: { hellMode } }),
}));

beforeEach(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  hellMode = false;
  user = { id: "user-1" };
});

afterEach(() => {
  document.documentElement.classList.remove("hell-mode");
  document.body.classList.remove("hell-mode");
  window.localStorage.removeItem(hellModeActiveKey);
  hardcoreUnlocked = false;
  hellMode = false;
});

describe("GlobalHellMode", () => {
  it("does not enable Hell mode without server access", () => {
    hellMode = true;

    render(createElement(GlobalHellMode));

    expect(document.body.classList.contains("hell-mode")).toBe(false);
  });

  it("removes the startup Hell mode when the user is logged out", () => {
    document.documentElement.classList.add("hell-mode");
    window.localStorage.setItem(hellModeActiveKey, "true");
    hardcoreUnlocked = true;
    hellMode = true;
    user = null;

    render(createElement(GlobalHellMode));

    expect(document.documentElement.classList.contains("hell-mode")).toBe(false);
    expect(window.localStorage.getItem(hellModeActiveKey)).toBeNull();
  });

  it("enables Hell mode only after the server confirms Hardcore access", () => {
    hardcoreUnlocked = true;
    hellMode = true;

    render(createElement(GlobalHellMode));

    expect(document.body.classList.contains("hell-mode")).toBe(true);
    expect(window.localStorage.getItem(hellModeActiveKey)).toBe("true");
  });

  it("stays off when the profile preference is off", () => {
    hardcoreUnlocked = true;

    render(createElement(GlobalHellMode));

    expect(document.body.classList.contains("hell-mode")).toBe(false);
    expect(window.localStorage.getItem(hellModeActiveKey)).toBeNull();
  });
});
