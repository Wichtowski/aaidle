"use client";

import { useState } from "react";
import { FaCheck, FaCopy } from "react-icons/fa6";
import { Button } from "../../../ui/Button";
import type { ClassicComparison } from "@lib/domain/guesses/comparison-types";
import type { Difficulty } from "@lib/domain/difficulty";
import { classicCategoryDetails, type ClassicCategory } from "@lib/domain/models/model-types";

const emojiForStatus: Record<string, string> = {
  correct: "🟩",
  partial: "🟨",
  incorrect: "🟥",
  higher: "🟦",
  lower: "🟦",
  unknown: "⬜",
};

export type ShareGuess = { comparison: ClassicComparison };
const difficultyShareDetails: Record<Difficulty, { emoji: string; label: string }> = {
  normal: { emoji: "🏅", label: "Normal" },
  challenge: { emoji: "🏆", label: "Challenge" },
  hardcore: { emoji: "🐐", label: "Hardcore" },
};

export function ShareResultButton({
  date,
  category,
  difficulty,
  guesses,
  streak,
}: {
  date: string;
  category: ClassicCategory;
  difficulty: Difficulty;
  guesses: ShareGuess[];
  streak: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const { emoji, label } = difficultyShareDetails[difficulty];
    const grid = guesses.map((guess) =>
      Object.values(guess.comparison)
        .map((status) => emojiForStatus[status])
        .join(""),
    );
    const share = [
      `aAIdle Classic ${classicCategoryDetails[category].label} ${emoji} ${label} - ${date}`,
      difficulty === "hardcore"
        ? `Escaped in ${guesses.length} offerings 🔥 ${streak}`
        : `Solved in ${guesses.length} guesses 🔥 ${streak}`,
      ...grid,
      "#aAIdle",
      window.location.origin,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(share);
    } catch {
      const field = document.createElement("textarea");
      field.value = share;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
  };

  const Icon = copied ? FaCheck : FaCopy;
  return (
    <Button className="completed__copy" onClick={copy}>
      <Icon aria-hidden focusable="false" />
      {copied ? "Copied!" : "Copy result"}
    </Button>
  );
}
