"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EmojiGamePayload } from "../../../lib/api/client";

const normalize = (value: string) => value.toLocaleLowerCase("en-US").trim();

type Family = EmojiGamePayload["families"][number];

export function FamilyAutocomplete({
  families,
  excluded,
  onPick,
  disabled = false,
}: {
  families: Family[];
  excluded: Set<string>;
  onPick: (family: Family) => void;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLFormElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const results = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return [];
    return families.filter((family) =>
      [family.name, family.providerName].some((value) =>
        normalize(value).includes(normalizedQuery),
      ),
    );
  }, [families, query]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (family: Family) => {
    if (disabled || excluded.has(family.id)) return;
    onPick(family);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };
  const firstAvailableIndex = () => results.findIndex((family) => !excluded.has(family.id));
  const selected = results[activeIndex] ?? results[firstAvailableIndex()];
  const canConfirm = Boolean(selected && !excluded.has(selected.id) && !disabled);

  const move = (direction: 1 | -1) => {
    const available = results
      .map((family, index) => ({ index, available: !excluded.has(family.id) }))
      .filter((option) => option.available);
    if (!available.length) return;
    setActiveIndex((current) => {
      const position = available.findIndex((option) => option.index === current);
      return available[
        position === -1
          ? direction === 1
            ? 0
            : available.length - 1
          : (position + direction + available.length) % available.length
      ].index;
    });
  };

  return (
    <form
      className="autocomplete"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) choose(selected);
      }}
      ref={rootRef}
    >
      <label htmlFor="family-search">Name the family</label>
      <div className="autocomplete__field">
        <input
          aria-activedescendant={activeIndex >= 0 ? `family-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls="family-options"
          aria-expanded={open}
          autoComplete="off"
          disabled={disabled}
          id="family-search"
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setOpen(Boolean(value.trim()));
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open && query.trim()) setOpen(true);
              move(event.key === "ArrowDown" ? 1 : -1);
            }
            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
            }
          }}
          placeholder="Search GPT, Claude, Gemini…"
          role="combobox"
          value={query}
        />
        <button className="autocomplete__confirm" disabled={!canConfirm} type="submit">
          Guess
        </button>
      </div>
      {open && results.length > 0 && (
        <ul id="family-options" role="listbox">
          {results.map((family, index) => {
            const unavailable = excluded.has(family.id);
            const active = index === activeIndex;
            return (
              <li
                aria-disabled={unavailable || disabled}
                aria-selected={active}
                id={`family-option-${index}`}
                key={family.id}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
              >
                <button
                  className={active ? "is-active" : undefined}
                  disabled={unavailable || disabled}
                  onClick={() => choose(family)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    if (!unavailable) setActiveIndex(index);
                  }}
                  type="button"
                >
                  <strong>{family.name}</strong>
                  <small>
                    {family.providerName}
                    {unavailable ? " · guessed" : ""}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
}
