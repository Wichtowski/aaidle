"use client";

import { useEffect, useState } from "react";
import { FaCircleQuestion } from "react-icons/fa6";
import { apiClient, type EmojiGamePayload } from "../../../lib/api/client";
import { SiteNavbar } from "../ui/SiteNavbar";
import { EmojiCompletedDialog } from "./EmojiCompletedDialog";
import { EmojiHowToPlayDialog } from "./EmojiHowToPlayDialog";
import { FamilyAutocomplete } from "./FamilyAutocomplete";
import { GameIntro } from "./GameLayout";

type EmojiGuess = {
  familyId: string;
  familyName: string;
  providerName: string;
  isCorrect: boolean;
};

type StoredEmojiGame = {
  guesses: EmojiGuess[];
  solved: boolean;
};

function storageKey(challenge: EmojiGamePayload["challenge"]) {
  return `aaidle:emoji:v1:${challenge.id}`;
}

function readStoredGame(challenge: EmojiGamePayload["challenge"]): StoredEmojiGame {
  if (typeof window === "undefined") return { guesses: [], solved: false };
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(challenge)) ?? "null") as StoredEmojiGame | null;
    if (!value || !Array.isArray(value.guesses)) return { guesses: [], solved: false };
    return {
      guesses: value.guesses,
      solved: Boolean(value.solved),
    };
  } catch {
    return { guesses: [], solved: false };
  }
}

export function EmojiGame({ initialGame }: { initialGame: EmojiGamePayload }) {
  const [game, setGame] = useState(initialGame);
  const [emoji, setEmoji] = useState(initialGame.challenge.initialEmoji);
  const [guesses, setGuesses] = useState<EmojiGuess[]>([]);
  const [solved, setSolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const guessedIds = new Set(guesses.map((guess) => guess.familyId));
  const revealCount = Math.min(
    game.challenge.maximumEmoji,
    2 + guesses.filter((guess) => !guess.isCorrect).length,
  );
  const clueSlots = Array.from({ length: game.challenge.maximumEmoji }, (_, index) => index);
  const lastGuess = guesses.at(-1);

  useEffect(() => {
    const saved = readStoredGame(game.challenge);
    setGuesses(saved.guesses);
    setSolved(saved.solved);
    setEmoji(game.challenge.initialEmoji);
    setLoaded(true);
  }, [game.challenge]);

  useEffect(() => {
    if (revealCount <= 2) return;
    void apiClient
      .emojiHints(game.challenge.id, revealCount)
      .then(({ emoji: revealed }) => setEmoji(revealed))
      .catch(() => setError("The next clue could not be revealed."));
  }, [game.challenge.id, revealCount]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(
      storageKey(game.challenge),
      JSON.stringify({ guesses, solved } satisfies StoredEmojiGame),
    );
  }, [game.challenge, guesses, loaded, solved]);

  const guess = async (family: EmojiGamePayload["families"][number]) => {
    if (busy || solved || guessedIds.has(family.id)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.submitEmojiGuess(
        game.challenge.id,
        family.id,
        guesses.length + 1,
      );
      const entry: EmojiGuess = {
        familyId: family.id,
        familyName: family.name,
        providerName: family.providerName,
        isCorrect: response.guess.isCorrect,
      };
      if (response.globalCompletionCount !== null) {
        const globalCompletionCount = response.globalCompletionCount;
        setGame((current) => ({ ...current, globalCompletionCount }));
      }
      setGuesses((current) => [...current, entry]);
      if (entry.isCorrect) {
        setSolved(true);
        setShowCompletion(true);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your guess could not be submitted.");
    } finally {
      setBusy(false);
    }
  };

  const refreshGame = () => {
    void apiClient
      .emojiGame()
      .then((next) => {
        setLoaded(false);
        setGame(next);
      })
      .catch(() => window.location.reload());
  };

  return (
    <main className="page game-page emoji-game-page">
      <SiteNavbar />
      <GameIntro
        completionCount={solved ? game.globalCompletionCount : null}
        description="Start with two clues. Each wrong guess uncovers the next one."
        expiresAt={game.challenge.expiresAt}
        eyebrow={<>Emoji · {game.challenge.date}</>}
        input={!solved && (
          <FamilyAutocomplete
            disabled={busy}
            excluded={guessedIds}
            families={game.families}
            onPick={(family) => void guess(family)}
          />
        )}
        onExpiry={refreshGame}
        status={busy && <p aria-live="polite" className="attempts">Checking…</p>}
        title="Which AI family is this?"
        titleId="emoji-game-title"
      />
      {error && <p className="notice" role="alert">{error}</p>}

      <section className="emoji-game" aria-label="Emoji clues and guesses">
        <ol className="emoji-game__clues" aria-label="Emoji clues">
          {clueSlots.map((slot) => {
            const revealed = slot < revealCount;
            return (
              <li className={revealed ? "emoji-game__clue" : "emoji-game__clue emoji-game__clue--hidden"} key={slot}>
                {revealed ? emoji[slot] ?? "…" : "?"}
              </li>
            );
          })}
        </ol>

        {guesses.length > 0 && (
          <section className="emoji-game__history" aria-labelledby="emoji-history-title">
            <h2 id="emoji-history-title">Your guesses</h2>
            <ol>
              {guesses.map((entry, index) => (
                <li className={entry.isCorrect ? "emoji-game__guess emoji-game__guess--correct" : "emoji-game__guess"} key={`${entry.familyId}:${index}`}>
                  <span>{index + 1}</span>
                  <strong>{entry.familyName}</strong>
                  <em>{entry.isCorrect ? "Correct" : "Not this family"}</em>
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>
      <button aria-label="Emoji game rules" className="game-help__button game-help__button--floating" onClick={() => setShowRules(true)} type="button">
        <FaCircleQuestion aria-hidden focusable="false" />
      </button>
      <EmojiHowToPlayDialog open={showRules} onClose={() => setShowRules(false)} />
      {showCompletion && solved && lastGuess?.isCorrect && (
        <EmojiCompletedDialog
          familyName={lastGuess.familyName}
          guesses={guesses}
          onClose={() => setShowCompletion(false)}
        />
      )}
    </main>
  );
}
