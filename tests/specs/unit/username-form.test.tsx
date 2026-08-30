// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsernameForm } from "../../../src/app/components/auth/UsernameForm";
import { apiClient } from "../../../src/lib/api/client";

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({
    setAuthenticatedUser: vi.fn(),
    user: { email: "runner@example.com", username: "runner" },
  }),
}));

describe("UsernameForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not save an unchanged username", async () => {
    const updateUsername = vi.spyOn(apiClient, "updateUsername");
    render(createElement(UsernameForm));

    fireEvent.click(screen.getByRole("button", { name: "Save username" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That username is already saved.");
    expect(updateUsername).not.toHaveBeenCalled();
  });

  it("shows username save success in a success toast", async () => {
    const updateUsername = vi.spyOn(apiClient, "updateUsername").mockResolvedValueOnce({
      user: {
        id: "user-1",
        email: "runner@example.com",
        displayName: null,
        username: "new_runner",
        emailVerified: true,
        permission: "user",
        disabled: false,
        disabledReason: null,
      },
    });
    render(createElement(UsernameForm));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new_runner" } });
    fireEvent.click(screen.getByRole("button", { name: "Save username" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveClass("toast");
    expect(status).toHaveAttribute("data-variant", "success");
    expect(status).toHaveTextContent("Your username is ready for the Speedrun leaderboard.");
    expect(document.querySelector(".profile-username .notice")).toBeNull();

    await waitFor(() => expect(updateUsername).toHaveBeenCalledWith("new_runner"));
  });

  it("shows username save errors in a toast", async () => {
    const updateUsername = vi
      .spyOn(apiClient, "updateUsername")
      .mockRejectedValueOnce(new Error("That username is already taken."));
    render(createElement(UsernameForm));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "taken_name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save username" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("toast");
    expect(alert).toHaveTextContent("That username is already taken.");
    expect(document.querySelector(".profile-username .notice[role='alert']")).toBeNull();

    await waitFor(() => expect(updateUsername).toHaveBeenCalledWith("taken_name"));
  });
});
