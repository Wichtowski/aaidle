// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameGuessAutocomplete } from "../../../src/app/components/game/common";

const options = [
  { id: "alpha", name: "Alpha" },
  { id: "beta", name: "Beta" },
];

function Harness({
  onSelect = vi.fn(),
}: {
  onSelect?: (option: (typeof options)[number]) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <>
      <GameGuessAutocomplete
        className="test-autocomplete"
        getOptionKey={(option) => option.id}
        idPrefix="test"
        inputId="test-search"
        label="Find an answer"
        onQueryChange={setQuery}
        onSelect={onSelect}
        options={query ? options : []}
        placeholder="Search…"
        query={query}
        renderOption={(option) => <strong>{option.name}</strong>}
      />
      <button type="button">Outside</button>
    </>
  );
}

describe("GameGuessAutocomplete", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("closes on an outside pointer press and reopens when focused", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Find an answer" });
    fireEvent.change(input, { target: { value: "a" } });
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(input.getAttribute("aria-expanded")).toBe("true");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("supports arrow navigation, Escape, and selection", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole("combobox", { name: "Find an answer" });
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("test-option-0");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("test-option-1");
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onSelect).toHaveBeenCalledWith(options[1]);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
