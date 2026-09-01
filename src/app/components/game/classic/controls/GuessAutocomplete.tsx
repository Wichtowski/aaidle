"use client";

import { useMemo, useState } from "react";
import { normalizeModelSearch } from "@lib/domain/models/model-normalizer";
import type { ClassicCategory, PublicModelIndex } from "@lib/domain/models/model-types";
import { GameGuessAutocomplete } from "../../common";

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
  const [query, setQuery] = useState("");
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

  return (
    <GameGuessAutocomplete
      className="autocomplete"
      confirmTestId="classic-guess-submit"
      disabled={disabled}
      getOptionKey={(model) => model.id}
      idPrefix="model"
      inputContainerClassName="autocomplete__input"
      inputId="model-search"
      inputName="model"
      isOptionDisabled={(model) => excluded.has(model.id)}
      label="Choose a model"
      onQueryChange={setQuery}
      onSelect={(model) => {
        onPick(model);
        setQuery("");
      }}
      options={results}
      placeholder={placeholderByCategory[category]}
      query={query}
      renderOption={(model) => (
        <>
          <strong>{model.name}</strong>
          <small>
            {model.providerName} · {model.familyName}
            {excluded.has(model.id) ? " · guessed" : ""}
          </small>
        </>
      )}
      toolDescription="Choose the AI model you think is the answer in the classic game."
      toolName="guessClassicModel"
      toolParamDescription="The name of the AI model to guess."
    />
  );
}
