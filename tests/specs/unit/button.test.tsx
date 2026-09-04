// @vitest-environment jsdom

import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../../src/app/components/ui/Button";

describe("Button", () => {
  it("defaults to a non-submitting button and forwards its ref and accessibility props", () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const ref = createRef<HTMLButtonElement>();
    render(
      <form onSubmit={submit}>
        <Button aria-pressed={true} ref={ref}>
          Focus mode
        </Button>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Focus mode" });
    fireEvent.click(button);
    expect(submit).not.toHaveBeenCalled();
    expect(ref.current).toBe(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("preserves submit behavior and prevents disabled actions", () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const click = vi.fn();
    render(
      <form onSubmit={submit}>
        <Button variant="primary" type="submit">
          Save username
        </Button>
        <Button variant="primary" color="danger" disabled onClick={click}>
          Delete
        </Button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save username" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(submit).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });

  it("uses router navigation for internal destinations", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Button variant="3d" to="/classic">
                Play Classic
              </Button>
            }
          />
          <Route path="/classic" element={<h1>Classic game</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Play Classic" }));
    expect(screen.getByRole("heading", { name: "Classic game" })).toBeInTheDocument();
  });

  it("keeps OAuth destinations as native links and forwards anchor refs", () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <Button color="oauth" fullWidth href="/api/v1/auth/oauth/github" ref={ref}>
        GitHub
      </Button>,
    );
    const link = screen.getByRole("link", { name: "GitHub" });
    expect(link).toHaveAttribute("href", "/api/v1/auth/oauth/github");
    expect(link).not.toHaveAttribute("type");
    expect(ref.current).toBe(link);
  });

  it("keeps the small 3D face inside one accessible link", () => {
    render(
      <Button
        variant="3d"
        size="small"
        href="https://ko-fi.com/wichtowski"
        target="_blank"
        rel="noreferrer"
      >
        Buy me a coffee
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Buy me a coffee" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
