"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeModelSearch } from "@lib/domain/models/model-normalizer";
import type { ClassicCategory, PublicModelIndex } from "@lib/domain/models/model-types";

const placeholderByCategory: Record<ClassicCategory, string> = {
  llm: "Search GPT-5.6, Claude Opus 4.8, Gemini...",
  cv: "Search ResNet, ViT, CLIP...",
  nlp: "Search BERT, RoBERTa, T5...",
  "object-detection": "Search YOLO, Faster R-CNN, DETR...",
  "classical-ml": "Search Random Forest, XGBoost, SVM...",
  filters: "Search Gaussian Blur, Sobel, Canny...",
  hardcore: "Search for what is beyond...",
};

export function GuessAutocomplete({
  category,
  models,
  excluded,
  onPick,
  disabled = false,
}: {
  category: ClassicCategory;
  models: PublicModelIndex[];
  excluded: Set<string>;
  onPick: (model: PublicModelIndex) => void;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLFormElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const results = useMemo(() => {
    const normalizedQuery = normalizeModelSearch(query);
    if (!normalizedQuery) return [];

    return models
      .filter((model) =>
        [model.name, model.providerName, model.familyName, ...model.aliases].some((value) =>
          normalizeModelSearch(value).includes(normalizedQuery),
        ),
      )
      .sort(
        (left, right) =>
          Number(normalizeModelSearch(right.name) === normalizedQuery) -
          Number(normalizeModelSearch(left.name) === normalizedQuery),
      );
  }, [models, query]);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    window.addEventListener("pointerdown", closeOnOutsidePress);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  useEffect(() => {
    if (activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const choose = (model: PublicModelIndex) => {
    if (disabled || excluded.has(model.id)) return;
    onPick(model);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const firstAvailableIndex = () => results.findIndex((model) => !excluded.has(model.id));

  const selected = results[activeIndex] ?? results[firstAvailableIndex()];
  const canConfirm = Boolean(selected && !excluded.has(selected.id) && !disabled);

  const confirm = () => {
    if (selected) choose(selected);
  };

  const moveActiveOption = (direction: 1 | -1) => {
    if (!results.length) return;

    setActiveIndex((currentIndex) => {
      const available = results
        .map((model, index) => ({ index, isAvailable: !excluded.has(model.id) }))
        .filter((option) => option.isAvailable);

      if (!available.length) return -1;

      const currentPosition = available.findIndex((option) => option.index === currentIndex);
      const nextPosition =
        currentPosition === -1
          ? direction === 1
            ? 0
            : available.length - 1
          : (currentPosition + direction + available.length) % available.length;

      return available[nextPosition].index;
    });
  };

  return (
    <form
      className="autocomplete"
      onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}
      ref={rootRef}
    >
      <label htmlFor="model-search">Choose a model</label>
      <div className="autocomplete__field">
        <input
          aria-activedescendant={activeIndex >= 0 ? `model-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls="model-options"
          aria-expanded={open}
          autoComplete="off"
          disabled={disabled}
          id="model-search"
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setOpen(value.trim().length > 0);
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open && query.trim()) setOpen(true);
              moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
            }

            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
            }
          }}
          placeholder={placeholderByCategory[category]}
          role="combobox"
          value={query}
        />
        <button
          className="autocomplete__confirm"
          data-testid="classic-guess-submit"
          disabled={!canConfirm}
          type="submit"
        >
          Guess
        </button>
      </div>
      {open && results.length > 0 && (
        <ul id="model-options" role="listbox">
          {results.map((model, index) => {
            const isExcluded = excluded.has(model.id);
            const isActive = index === activeIndex;

            return (
              <li
                aria-disabled={isExcluded || disabled}
                aria-selected={isActive}
                id={`model-option-${index}`}
                key={model.id}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
              >
                <button
                  className={isActive ? "is-active" : undefined}
                  disabled={isExcluded || disabled}
                  onClick={() => choose(model)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    if (!isExcluded) setActiveIndex(index);
                  }}
                  type="button"
                >
                  <strong>{model.name}</strong>
                  <small>
                    {model.providerName} · {model.familyName}
                    {isExcluded ? " · guessed" : ""}
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
