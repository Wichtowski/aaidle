"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { GuessRow } from "./GuessRow";
import {
  classicColumnHeadings,
  classicColumns,
  classicColumnsForGame,
  type ClassicComparison,
  type ClassicColumn,
} from "@lib/domain/guesses/comparison-types";
import type {
  ClassicCategory,
  ClassicDifficulty,
  ComparableModel,
} from "@lib/domain/models/model-types";

const compactAfterGuessCount = 5;

type BoardGuess = {
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
};

const autoCollapsedGuessIds = (requestIds: string[]) =>
  requestIds.length > compactAfterGuessCount ? new Set(requestIds.slice(0, -1)) : new Set<string>();

export function GuessBoard({
  guesses,
  difficulty = "normal",
  category,
  columns: declaredColumns,
}: {
  guesses: BoardGuess[];
  difficulty?: ClassicDifficulty;
  category?: ClassicCategory;
  columns?: string[];
}) {
  const columns: readonly ClassicColumn[] = declaredColumns?.length
    ? declaredColumns.filter((column): column is ClassicColumn => classicColumns.includes(column as ClassicColumn))
    : category
      ? classicColumnsForGame(category, difficulty)
      : classicColumns;
  const guessIds = guesses.map((guess) => guess.requestId);
  const guessKey = guessIds.join(":");
  const [collapsedGuessIds, setCollapsedGuessIds] = useState<Set<string>>(() => new Set());
  const previousGuessIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const nextGuessIds = new Set(guessKey ? guessKey.split(":") : []);
    const previous = previousGuessIds.current;
    const isNewGame =
      previous === null ||
      (nextGuessIds.size > 0 && ![...nextGuessIds].some((guessId) => previous.has(guessId)));

    previousGuessIds.current = nextGuessIds;

    setCollapsedGuessIds((current) =>
      isNewGame
        ? autoCollapsedGuessIds([...nextGuessIds])
        : new Set([...current].filter((guessId) => nextGuessIds.has(guessId))),
    );
  }, [guessKey]);

  const collapseGuess = (requestId: string) => {
    setCollapsedGuessIds((current) => new Set(current).add(requestId));
  };

  const expandGuess = (requestId: string) => {
    setCollapsedGuessIds((current) => {
      const next = new Set(current);
      next.delete(requestId);
      return next;
    });
  };

  return (
    <section
      className={`board-wrap${guesses.length === 0 ? " board-wrap--empty" : ""}${
        category === "hardcore" ? " board-wrap--hardcore" : ""
      }`}
      aria-label="Guess comparisons"
      role="table"
      style={
        {
          "--guess-board-columns": columns.length,
          "--guess-board-width": `${
            category === "hardcore"
              ? 160 + columns.length * 100
              : Math.min(1720, 160 + columns.length * 130)
          }px`,
        } as CSSProperties
      }
    >
      <div className="board-head" role="row">
        <span aria-hidden="true" className="board-head__guess" />
        <div className="board-head__cards">
          {columns.map((column) => (
            <span key={column} role="columnheader">
              {classicColumnHeadings[column]}
            </span>
          ))}
        </div>
      </div>
      {guesses.map((guess, index) => {
        const canCollapse = guess.revealed && guess.showCards;
        const isCollapsed = canCollapse && collapsedGuessIds.has(guess.requestId);

        if (isCollapsed) {
          return (
            <div className="guess-row guess-row--collapsed" key={guess.requestId} role="row">
              <button
                aria-expanded="false"
                aria-label={`Show comparison for guess ${index + 1}: ${guess.model.name}`}
                className="guess-row__expand"
                onClick={() => expandGuess(guess.requestId)}
                type="button"
              >
                <span className="guess-row__expand-model">
                  <span className="guess-row__expand-guess">
                    <span>Guess {index + 1}.</span>
                    <FaChevronDown aria-hidden focusable="false" />
                  </span>
                  <strong>{guess.model.name}</strong>
                </span>
              </button>
            </div>
          );
        }

        return (
          <GuessRow
            {...guess}
            columns={columns}
            difficulty={difficulty}
            hardcore={difficulty === "hardcore"}
            key={guess.requestId}
            onCollapse={canCollapse ? () => collapseGuess(guess.requestId) : undefined}
            rowIndex={index}
          />
        );
      })}
    </section>
  );
}
