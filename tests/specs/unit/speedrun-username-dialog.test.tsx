// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { SpeedrunUsernameDialog } from "../../../src/app/components/game/timeline/SpeedrunUsernameDialog";

describe("SpeedrunUsernameDialog", () => {
  it("does not save an empty username", () => {
    const onChoose = vi.fn();
    render(createElement(SpeedrunUsernameDialog, { email: "runner@example.com", onChoose }));

    const saveButton = screen.getByRole("button", { name: "Save username" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);

    expect(onChoose).not.toHaveBeenCalled();
  });

  it("saves a valid username", () => {
    const onChoose = vi.fn();
    render(createElement(SpeedrunUsernameDialog, { email: "runner@example.com", onChoose }));

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "runner_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save username" }));

    expect(onChoose).toHaveBeenCalledWith("runner_1");
  });

  it("keeps the email-name fallback as an explicit action", () => {
    const onChoose = vi.fn();
    render(createElement(SpeedrunUsernameDialog, { email: "runner@example.com", onChoose }));

    fireEvent.click(screen.getByRole("button", { name: "Use runner" }));

    expect(onChoose).toHaveBeenCalledWith(null);
  });
});
