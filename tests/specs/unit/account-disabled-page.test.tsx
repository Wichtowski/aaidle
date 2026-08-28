// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountDisabledPage } from "../../../src/app/pages/auth/AccountDisabledPage";

const signOut = vi.fn(async () => {});

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({
    retry: vi.fn(),
    signOut,
    unavailable: false,
    user: {
      disabled: true,
      disabledReason: "Production E2E disabled-account fixture",
      permission: "user",
    },
  }),
}));

afterEach(() => {
  cleanup();
  signOut.mockClear();
});

describe("AccountDisabledPage", () => {
  it("shows the disable reason and confirms before signing out", () => {
    render(createElement(MemoryRouter, null, createElement(AccountDisabledPage)));

    expect(screen.getByTestId("account-disabled-reason").textContent).toContain(
      "Production E2E disabled-account fixture",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Sign out" })[0]);

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Are you sure you want to sign out?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Sign out" }).at(-1)!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
