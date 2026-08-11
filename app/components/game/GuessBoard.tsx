import { GuessRow } from "./GuessRow";
import type { ClassicComparison } from "../../../lib/domain/guesses/comparison-types";
import type { ComparableModel } from "../../../lib/domain/models/model-types";
const headings = [
  "Provider",
  "Country",
  "Family",
  "Categories",
  "Input",
  "Output",
  "Use cases",
  "Reasoning",
  "Open",
  "Local",
  "Year · Q",
  "Context",
];
export function GuessBoard({
  guesses,
}: {
  guesses: Array<{
    model: ComparableModel;
    comparison: ClassicComparison;
    matchingCategories: string[];
    matchingInputModalities: string[];
    matchingUseCases: string[];
    matchingOutputModalities: string[];
    requestId: string;
    revealed: boolean;
    animate: boolean;
    showCards: boolean;
  }>;
}) {
  return (
    <section
      className={`board-wrap${guesses.length === 0 ? " board-wrap--empty" : ""}`}
      aria-label="Guess comparisons"
      role="table"
    >
      <div className="board-head" role="row">
        <span aria-hidden="true" className="board-head__guess" />
        <div className="board-head__cards">
          {headings.map((heading) => (
            <span key={heading} role="columnheader">
              {heading}
            </span>
          ))}
        </div>
      </div>
      {guesses.map((guess, index) => (
        <GuessRow {...guess} rowIndex={index} key={guess.requestId} />
      ))}
    </section>
  );
}
