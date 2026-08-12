import { ComparisonCell } from "./ComparisonCell";
import { FaChevronUp } from "react-icons/fa6";
import type { ClassicComparison } from "../../../lib/domain/guesses/comparison-types";
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
  if (!country) return <>Unknown</>;
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
  value == null ? "Unknown" : typeof value === "boolean" ? (value ? "Yes" : "No") : value;

const yq = (model: ComparableModel) => {
  if (model.releaseYear === null) return "Unknown";
  const month = model.releaseDate ? Number(model.releaseDate.slice(5, 7)) : 0;
  return month ? `${model.releaseYear} · Q${Math.ceil(month / 3)}` : String(model.releaseYear);
};

const contextWindow = (tokens: number | null) => {
  if (tokens === null) return "Unknown";
  if (tokens <= 10_000 || tokens % 100 !== 0) return String(tokens);

  return `${tokens / 1_000}K`;
};

function MatchedList({
  items,
  matches,
  highlightMatches,
}: {
  items: string[] | null;
  matches: string[];
  highlightMatches: boolean;
}) {
  if (!items?.length) return <>Unknown</>;

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
  onCollapse?: () => void;
}) {
  const fields = [
    { status: comparison.provider, value: label(model.provider) },
    {
      status: comparison.country,
      value: (
        <CountryValue
          country={model.country ?? (model.provider ? countryForProvider[model.provider] : null)}
        />
      ),
    },
    { status: comparison.family, value: label(model.family) },
    {
      status: comparison.categories,
      value: (
        <MatchedList
          highlightMatches={!hardcore}
          items={model.categories}
          matches={matchingCategories}
        />
      ),
    },
    {
      status: comparison.inputModalities,
      value: (
        <MatchedList
          highlightMatches={!hardcore}
          items={model.inputModalities}
          matches={matchingInputModalities}
        />
      ),
    },
    {
      status: comparison.outputModalities,
      value: (
        <MatchedList
          highlightMatches={!hardcore}
          items={model.outputModalities}
          matches={matchingOutputModalities}
        />
      ),
    },
    {
      status: comparison.useCases,
      value: (
        <MatchedList
          highlightMatches={!hardcore}
          items={model.useCases}
          matches={matchingUseCases}
        />
      ),
    },
    { status: comparison.reasoningSupport, value: label(model.reasoningSupport) },
    { status: comparison.openWeights, value: label(model.openWeights) },
    { status: comparison.localExecution, value: label(model.localExecution) },
    { status: comparison.releaseYear, value: yq(model) },
    { status: comparison.contextWindowTokens, value: contextWindow(model.contextWindowTokens) },
  ];

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
          {fields.map((field, index) => (
            <ComparisonCell
              animate={animate}
              delay={index * 125}
              key={index}
              revealed={revealed}
              status={field.status}
              hardcore={hardcore}
            >
              {field.value}
            </ComparisonCell>
          ))}
        </div>
      )}
    </article>
  );
}
