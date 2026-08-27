import { useState } from "react";
import { EmojiGame } from "@components/game";
import type { EmojiDifficulty } from "@lib/api/client";
import { readGamePreferences, saveEmojiDifficulty } from "@lib/storage/game-preferences";

export function EmojiPage() {
  const [difficulty, setDifficulty] = useState<EmojiDifficulty>(
    () => readGamePreferences().emoji,
  );

  const handleDifficultyChange = (nextDifficulty: string) => {
    const next = nextDifficulty as EmojiDifficulty;
    saveEmojiDifficulty(next);
    setDifficulty(next);
  };

  return <EmojiGame difficulty={difficulty} onDifficultyChange={handleDifficultyChange} />;
}
