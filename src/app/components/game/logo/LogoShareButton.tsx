import { useState } from "react";

export function LogoShareButton({ guessCount, clueCount }: { guessCount: number; clueCount: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const clue = clueCount > 0 ? "💡" : "🧠";
    await navigator.clipboard.writeText(["aAIdle Logo", `Solved in ${guessCount} guess${guessCount === 1 ? "" : "es"}`, clue].join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };
  return <button className="button" onClick={() => void copy()} type="button">{copied ? "Copied result" : "Copy result"}</button>;
}
