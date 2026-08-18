// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../src/app/components/auth/auth-context";
import { LoginForm } from "../../../src/app/components/auth/LoginForm";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function renderLoginForm() {
  return render(
    createElement(
      AuthContext.Provider,
      {
        value: {
          loading: false,
          unavailable: false,
          user: null,
          setAuthenticatedUser: () => {},
          signOut: async () => {},
          retry: () => {},
        },
      },
      createElement(LoginForm),
    ),
  );
}

describe("LoginForm", () => {
  it("shows and hides the password with the eye toggle", () => {
    renderLoginForm();

    const password = screen.getByLabelText("Password", { exact: true });
    expect(password.getAttribute("type")).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.getAttribute("type")).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.getAttribute("type")).toBe("password");
  });

  it("shows password recovery only after a failed sign-in", async () => {
    renderLoginForm();
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "INVALID_CREDENTIALS", message: "Sign-in failed." } }),
    });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.com" } });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("alert").textContent).toContain("Sign-in failed.");
    expect(screen.queryByRole("button", { name: "Send activation email" })).toBeNull();
  });

  it("accepts an unverified account for sign-in", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: "user-1",
          email: "player@example.com",
          displayName: null,
          emailVerified: false,
        },
      }),
    });
    renderLoginForm();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.com" } });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("shows the rate-limit response in an error toast", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: "RATE_LIMITED",
          message: "Too many sign-in attempts. Please wait a few minutes before trying again.",
        },
      }),
    });
    renderLoginForm();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.com" } });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Too many sign-in attempts.");
    });
  });
});
