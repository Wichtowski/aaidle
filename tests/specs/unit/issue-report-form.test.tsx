// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssueReportForm } from "../../../src/app/components/issues/IssueReportForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IssueReportForm", () => {
  it("lets a user request more reports after reaching the daily limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "RATE_LIMITED", message: "Daily issue report limit reached." },
          }),
          { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "86400" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<IssueReportForm />);

    fireEvent.change(screen.getByLabelText("Game"), { target: { value: "classic" } });
    fireEvent.change(screen.getByLabelText("Short title"), {
      target: { value: "Broken game board" },
    });
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "The game board does not render after loading." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    const requestButton = await screen.findByRole("button", { name: "Request more reports" });
    fireEvent.click(requestButton);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("sent to the administrators");
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/issues/limit-request");
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "POST" }));
  });
});
