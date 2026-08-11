import { ComparisonCell } from "./ComparisonCell";
import type { ClassicComparison } from "../../lib/domain/guesses/comparison-types";
import type { ComparableModel } from "../../lib/domain/models/model-types";

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
  "United States": "🇺🇸",
  Canada: "🇨🇦",
  China: "🇨🇳",
  France: "🇫🇷",
  Poland: "🇵🇱",
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

function MatchedList({ items, matches }: { items: string[] | null; matches: string[] }) {
  if (!items?.length) return <>Unknown</>;

  return (
    <>
      {items.map((item, index) => {
        const isMatch = matches.some(
          (match) => match.toLocaleLowerCase() === item.toLocaleLowerCase(),
        );
        return (
          <span key={item}>
            {isMatch ? <strong className="matched-value">{item}</strong> : item}
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
}: {
  model: ComparableModel;
  comparison: ClassicComparison;
  matchingCategories: string[];
  matchingInputModalities: string[];
  matchingOutputModalities: string[];
  matchingUseCases: string[];
  rowIndex: number;
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
      value: <MatchedList items={model.categories} matches={matchingCategories} />,
    },
    {
      status: comparison.inputModalities,
      value: <MatchedList items={model.inputModalities} matches={matchingInputModalities} />,
    },
    {
      status: comparison.outputModalities,
      value: <MatchedList items={model.outputModalities} matches={matchingOutputModalities} />,
    },
    {
      status: comparison.useCases,
      value: <MatchedList items={model.useCases} matches={matchingUseCases} />,
    },
    { status: comparison.reasoningSupport, value: label(model.reasoningSupport) },
    { status: comparison.openWeights, value: label(model.openWeights) },
    { status: comparison.localExecution, value: label(model.localExecution) },
    { status: comparison.releaseYear, value: yq(model) },
    { status: comparison.contextWindowTokens, value: contextWindow(model.contextWindowTokens) },
  ];

  return (
    <article className="guess-row" role="row">
      <header className="guess-row__model" role="rowheader">
        <span>Guess {rowIndex + 1}.</span>
        <strong>{model.name}</strong>
      </header>
      <div className="guess-row__cards">
        {fields.map((field, index) => (
          <ComparisonCell delay={index * 100} key={index} status={field.status}>
            {field.value}
          </ComparisonCell>
        ))}
      </div>
    </article>
  );
}
