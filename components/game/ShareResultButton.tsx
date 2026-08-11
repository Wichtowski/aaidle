"use client";

import { useState } from "react";
import { FaCheck, FaCopy } from "react-icons/fa6";
import type { ClassicComparison } from "../../lib/domain/guesses/comparison-types";

const emojiForStatus: Record<string, string> = {
  correct: "🟩",
  partial: "🟨",
  incorrect: "🟥",
  higher: "🟦",
  lower: "🟦",
  unknown: "⬜",
};

export type ShareGuess = { comparison: ClassicComparison };

export function ShareResultButton({
  date,
  guesses,
  streak,
}: {
  date: string;
  guesses: ShareGuess[];
  streak: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const grid = guesses.map((guess) =>
      Object.values(guess.comparison)
        .map((status) => emojiForStatus[status])
        .join(""),
    );
    const share = [
      `AIdle Classic — ${date}`,
      `Solved in ${guesses.length} guesses 🔥 ${streak}`,
      ...grid,
      "#AIdle",
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
    <button className="button completed__copy" onClick={copy}>
      <Icon aria-hidden focusable="false" />
      {copied ? "Copied!" : "Copy result"}
    </button>
  );
}
