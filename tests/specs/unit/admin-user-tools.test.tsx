// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserDetail } from "../../../src/app/pages/admin/AdminPage";
import type { AdminUserDetail } from "../../../src/lib/api/client";

const user: AdminUserDetail = {
  id: "user-1",
  email: "player@example.com",
  displayName: "Player",
  emailVerifiedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  permission: "user",
  disabledAt: null,
  disabledReason: null,
  issueReportLimit: 2,
  issueReportLimitRequestedAt: 2,
  signInProviders: ["password"],
  lastSeenAt: null,
  progressUpdatedAt: null,
  completionCount: 0,
  hardcoreUnlocked: false,
  progress: null,
  completions: [],
};

afterEach(cleanup);

describe("admin user tools", () => {
  it("shows account controls and issue reports as separate tabs", () => {
    const onUpdate = vi.fn();
    render(
      <UserDetail
        canManageAccount
        currentUserId="admin-1"
        onRemoveGuess={undefined}
        onUpdate={onUpdate}
        removingGuessId={null}
        updating={false}
        user={user}
      />,
    );

    expect(screen.getByRole("tab", { name: "Account access" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("heading", { name: "Account access" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Issue reports" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Issue reports/ }));

    expect(screen.queryByRole("heading", { name: "Account access" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Issue reports" })).toBeTruthy();
    expect(screen.getByText("Requested")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Decrease issue reports per day" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease issue reports per day" }));
    expect(document.getElementById("admin-issue-report-limit")?.textContent).toContain("0");
    expect(screen.getByText("This user will not be able to submit issue reports.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save limit" }));
    expect(onUpdate).toHaveBeenCalledWith({ issueReportLimit: 0 });
  });
});
