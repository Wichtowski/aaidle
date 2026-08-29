import { useState } from "react";
import type { EmojiDifficulty } from "@lib/api/client";

export function EmojiShareButton({
  difficulty,
  guessCount,
}: {
  difficulty: EmojiDifficulty;
  guessCount: number;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const text = [
      `aAIdle Emoji ${difficulty}`,
      `Solved in ${guessCount} guess${guessCount === 1 ? "" : "es"}`,
      "🟩",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <button className="button" onClick={() => void share()} type="button">
      {copied ? "Copied result" : "Share result"}
    </button>
  );
}
