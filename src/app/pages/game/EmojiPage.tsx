import { useState } from "react";
import { useParams } from "react-router-dom";
import { EmojiGame } from "@components/game";
import type { EmojiDifficulty } from "@lib/api/client";
import { readGamePreferences, saveEmojiDifficulty } from "@lib/storage/game-preferences";

export function EmojiPage() {
  const { date } = useParams();
  const [difficulty, setDifficulty] = useState<EmojiDifficulty>(() => readGamePreferences().emoji);

  const handleDifficultyChange = (nextDifficulty: string) => {
    const next = nextDifficulty as EmojiDifficulty;
    saveEmojiDifficulty(next);
    setDifficulty(next);
  };

  return (
    <EmojiGame
      key={date ?? "today"}
      requestedDate={date}
      difficulty={difficulty}
      onDifficultyChange={handleDifficultyChange}
    />
  );
}
