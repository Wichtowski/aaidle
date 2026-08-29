// @vitest-environment jsdom

import { createElement } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalHellMode } from "../../../src/app/components/ui/GlobalHellMode";

let hardcoreUnlocked = false;
let hellMode = false;

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({
    hardcoreUnlocked,
    user: { id: "user-1" },
  }),
}));

vi.mock("../../../src/lib/storage/use-local-progress", () => ({
  useLocalProgress: () => ({ preferences: { hellMode } }),
}));

beforeEach(() => {
  hellMode = false;
});

afterEach(() => {
  document.documentElement.classList.remove("hell-mode");
  document.body.classList.remove("hell-mode");
  hardcoreUnlocked = false;
  hellMode = false;
});

describe("GlobalHellMode", () => {
  it("does not enable Hell mode without server access", () => {
    hellMode = true;

    render(createElement(GlobalHellMode));

    expect(document.body.classList.contains("hell-mode")).toBe(false);
  });

  it("enables Hell mode only after the server confirms Hardcore access", () => {
    hardcoreUnlocked = true;
    hellMode = true;

    render(createElement(GlobalHellMode));

    expect(document.body.classList.contains("hell-mode")).toBe(true);
  });

  it("stays off when the profile preference is off", () => {
    hardcoreUnlocked = true;

    render(createElement(GlobalHellMode));

    expect(document.body.classList.contains("hell-mode")).toBe(false);
  });
});
