import { ComparisonCell } from "./ComparisonCell";
import { FaChevronUp } from "react-icons/fa6";
import type { ReactNode } from "react";
import {
  classicColumns,
  type ClassicColumn,
  type ClassicComparison,
} from "../../../lib/domain/guesses/comparison-types";
import type { ComparableModel } from "../../../lib/domain/models/model-types";

const countryForProvider: Record<string, string> = {
  OpenAI: "United States",
  Anthropic: "United States",
  Google: "United States",
  Meta: "United States",
  "Mistral AI": "France",
  DeepSeek: "China",
  xAI: "United States",
  Alibaba: "China",
  Cohere: "Canada",
  SpeakLeash: "Poland",
  PLLuM: "Poland",
  Allegro: "Poland",
  Microsoft: "United States",
  Amazon: "United States",
  IBM: "United States",
};

const countryFlag: Record<string, string> = {
  Australia: "🇦🇺",
  "United States": "🇺🇸",
  Canada: "🇨🇦",
  China: "🇨🇳",
  France: "🇫🇷",
  "France / United States": "🇫🇷 🇺🇸",
  Germany: "🇩🇪",
  Israel: "🇮🇱",
  Netherlands: "🇳🇱",
  Poland: "🇵🇱",
  Russia: "🇷🇺",
  Switzerland: "🇨🇭",
  Taiwan: "🇹🇼",
  "United Kingdom": "🇬🇧",
};

function CountryValue({ country }: { country: string | null | undefined }) {
  if (!country) return <>N/A</>;
  return (
    <span className="country-value">
      <span className="country-value__flag" aria-hidden="true">
        {countryFlag[country] ?? "🌐"}
      </span>
      <span className="country-value__name">{country}</span>
    </span>
  );
}

const label = (value: string | number | boolean | null | undefined) =>
  value == null ? "N/A" : typeof value === "boolean" ? (value ? "Yes" : "No") : value;

const yq = (model: ComparableModel) => {
  if (model.releaseYear === null) return "N/A";
  const month = model.releaseDate ? Number(model.releaseDate.slice(5, 7)) : 0;
  return month ? `${model.releaseYear} · Q${Math.ceil(month / 3)}` : String(model.releaseYear);
};

const contextWindow = (tokens: number | null) => {
  if (tokens === null) return "N/A";
  if (tokens <= 10_000 || tokens % 100 !== 0) return String(tokens);

  return `${tokens / 1_000}K`;
};

function categoryValue(model: ComparableModel, field: string): ReactNode {
  const details = model.categoryDetails;
  const language = details?.["language-model"];
  const vision = details?.["computer-vision"];
  const nlp = details?.nlp;
  const detection = details?.["object-detection"];
  const classical = details?.["classical-ml"];
  const value = {
    supportedLanguages: language?.supportedLanguages ?? nlp?.supportedLanguages,
    toolUse: language?.toolUse,
    multimodal: language?.multimodal,
    visionTasks: vision?.visionTasks,
    architecture: vision?.architecture ?? nlp?.architecture ?? detection?.architecture,
    trainingDatasets: vision?.trainingDatasets ?? nlp?.trainingDatasets ?? detection?.trainingDatasets,
    license: vision?.license,
    nlpTasks: nlp?.nlpTasks,
    detectionTypes: detection?.detectionTypes,
    realTimeCapable: detection?.realTimeCapable,
    algorithmTypes: classical?.algorithmTypes,
    learningParadigms: classical?.learningParadigms,
    objectives: classical?.objectives,
    featureTypes: classical?.featureTypes,
    frameworks: classical?.frameworks,
  }[field];
  if (Array.isArray(value)) return value.length ? value.join(", ") : "N/A";
  if (value == null) return "N/A";
  return label(value);
}

function MatchedList({
  items,
  matches,
  highlightMatches,
}: {
  items: string[] | null;
  matches: string[];
  highlightMatches: boolean;
}) {
  if (!items?.length) return <>N/A</>;

  return (
    <>
      {items.map((item, index) => {
        const isMatch = matches.some(
          (match) => match.toLocaleLowerCase() === item.toLocaleLowerCase(),
        );
        return (
          <span key={item}>
            {highlightMatches && isMatch ? <strong className="matched-value">{item}</strong> : item}
            {index < items.length - 1 ? ", " : ""}
          </span>
        );
      })}
    </>
  );
}

export function GuessRow({
  model,
  comparison,
  matchingCategories,
  matchingInputModalities,
  matchingOutputModalities,
  matchingUseCases,
  rowIndex,
  revealed,
  animate,
  showCards,
  hardcore,
  columns = classicColumns,
  onCollapse,
}: {
  model: ComparableModel;
  comparison: ClassicComparison;
  matchingCategories: string[];
  matchingInputModalities: string[];
  matchingOutputModalities: string[];
  matchingUseCases: string[];
  rowIndex: number;
  revealed: boolean;
  animate: boolean;
  showCards: boolean;
  hardcore: boolean;
  columns?: readonly ClassicColumn[];
  onCollapse?: () => void;
}) {
  const fields: Record<string, { status: string; value: ReactNode }> = {
    provider: { status: comparison.provider, value: label(model.provider) },
    country: {
      status: comparison.country,
      value: (
        <CountryValue
          country={model.country ?? (model.provider ? countryForProvider[model.provider] : null)}
        />
      ),
    },
    family: { status: comparison.family, value: label(model.family) },
    categories: {
      status: comparison.categories,
      value: (
        <MatchedList
          highlightMatches={!hardcore}
          items={model.categories}
          matches={matchingCategories}
        />
      ),
    },
    inputModalities: {
      status: comparison.inputModalities,
      value: (
        <MatchedList
          highlightMatches={!hardcore}
          items={model.inputModalities}
          matches={matchingInputModalities}
        />
      ),
    },
    outputModalities: {
      status: comparison.outputModalities,
      value: (
        <MatchedList
          highlightMatches={!hardcore}
          items={model.outputModalities}
          matches={matchingOutputModalities}
        />
      ),
    },
    useCases: {
      status: comparison.useCases,
      value: (
        <MatchedList
          highlightMatches={!hardcore}
          items={model.useCases}
          matches={matchingUseCases}
        />
      ),
    },
    reasoningSupport: { status: comparison.reasoningSupport, value: label(model.reasoningSupport) },
    weightAvailability: { status: comparison.weightAvailability, value: label(model.weightAvailability) },
    release: { status: comparison.release, value: yq(model) },
    contextWindowTokens: {
      status: comparison.contextWindowTokens,
      value: contextWindow(model.contextWindowTokens),
    },
    ...Object.fromEntries(["supportedLanguages", "toolUse", "multimodal", "visionTasks", "architecture", "trainingDatasets", "license", "nlpTasks", "detectionTypes", "realTimeCapable", "algorithmTypes", "learningParadigms", "objectives", "featureTypes", "frameworks"].map((field) => [field, { status: comparison[field] ?? "unknown", value: categoryValue(model, field) }])),
  };

  const modelSummary = (
    <>
      <div className="guess-row__label">
        <span>Guess {rowIndex + 1}.</span>
        {onCollapse && <FaChevronUp aria-hidden focusable="false" />}
      </div>
      <strong>{model.name}</strong>
    </>
  );

  return (
    <article className="guess-row" role="row">
      <header className="guess-row__model" role="rowheader">
        {onCollapse ? (
          <button
            aria-expanded="true"
            aria-label={`Collapse comparison for guess ${rowIndex + 1}: ${model.name}`}
            className="guess-row__toggle"
            onClick={onCollapse}
            type="button"
          >
            {modelSummary}
          </button>
        ) : (
          modelSummary
        )}
      </header>
      {showCards && (
        <div className="guess-row__cards">
          {columns.map((column, index) => {
            const field = fields[column];
            return (
            <ComparisonCell
              animate={animate}
              delay={index * 125}
              key={column}
              revealed={revealed}
              status={field.status}
              hardcore={hardcore}
            >
              {field.value}
            </ComparisonCell>
            );
          })}
        </div>
      )}
      {!showCards && (
        <div aria-label="Loading comparison cards" className="guess-row__loading" role="status">
          <span aria-hidden="true" className="guess-row__spinner" />
        </div>
      )}
    </article>
  );
}
