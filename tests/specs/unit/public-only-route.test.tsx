// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PublicOnlyRoute } from "../../../src/app/components/auth/PublicOnlyRoute";

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({ loading: false, user: { id: "user-1" } }),
}));

describe.each(["/login", "/register"])("%s redirects authenticated users", (path) => {
  it("to the homepage", () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<p>Login</p>} />
            <Route path="/register" element={<p>Register</p>} />
          </Route>
          <Route path="/" element={<p>Homepage</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Homepage")).toBeInTheDocument();
  });
});
