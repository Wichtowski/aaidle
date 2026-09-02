import { lazy, Suspense, useState, type CSSProperties } from "react";
import { FaCircleQuestion, FaLock } from "react-icons/fa6";
import { type EmojiDifficulty, type VisualClue } from "@lib/api/client";
import { utcDate } from "@lib/utils/dates";
import { SiteNavbar } from "../../ui/SiteNavbar";
import { GameEyebrow } from "../common/layout/GameEyebrow";
import { GameIntro } from "../common/layout/GameLayout";
import { GameGuessAutocomplete } from "../common";
import { ApiUnavailableState } from "../../ui/ApiUnavailableState";
import { GameLoadingState } from "../../ui/GameLoadingState";
import { Toast } from "../../ui/Toast";
import { EmojiIcon } from "./emoji-icons";
import { EmojiHTP } from "./EmojiHTP";
import { DifficultySwitch } from "../common/layout/DifficultySwitch";
import { useEmojiGame } from "./use-emoji-game";

const EmojiCompletedDialog = lazy(() =>
  import("./EmojiCompletedDialog").then(({ EmojiCompletedDialog }) => ({
    default: EmojiCompletedDialog,
  })),
);

const emojiPools: ReadonlyArray<{
  difficulty: EmojiDifficulty;
  pool: 0 | 1 | 2;
  label: string;
}> = [
  { difficulty: "normal", pool: 0, label: "Normal" },
  { difficulty: "challenge", pool: 1, label: "Challenge" },
  { difficulty: "hardcore", pool: 2, label: "Hardcore" },
];

function clueKey(clue: VisualClue | undefined) {
  if (!clue) return "hidden";
  if (clue.type === "emoji") return `emoji-${clue.value}`;
  if (clue.type === "icon") return `icon-${clue.icon}`;
  return `image-${clue.src}`;
}

export function EmojiGame({
  difficulty,
  onDifficultyChange,
}: {
  difficulty: EmojiDifficulty;
  onDifficultyChange: (difficulty: string) => void;
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const {
    available,
    busy,
    choose,
    error,
    game,
    guesses,
    hardcore,
    isLoadingGame,
    query,
    setLoadAttempt,
    setQuery,
    setShowCompletion,
    setToast,
    showCompletion,
    solved,
    toast,
  } = useEmojiGame(difficulty);
  const completed = hardcore?.completedCategories ?? [];
  const date = game?.challenge.date ?? utcDate();
  const selectedPool = emojiPools.find((pool) => pool.difficulty === difficulty)!;
  return (
    <main className="page game-page emoji-page">
      <SiteNavbar />
      <GameIntro
        completionCount={solved ? (game?.globalCompletionCount ?? null) : null}
        description="Use the visual clues to identify the hidden AI system, architecture, algorithm, or operator. Wrong guesses can reveal more clues."
        expiresAt={game?.challenge.expiresAt ?? null}
        eyebrow={<GameEyebrow date={date} game="Emoji" variant={selectedPool.label} />}
        title="Guess today’s hidden AI idea"
        titleId="emoji-title"
        difficulty={
          <DifficultySwitch
            ariaLabel="Emoji difficulty"
            disabled={busy || isLoadingGame}
            onChange={onDifficultyChange}
            options={emojiPools
              .filter((pool) => pool.difficulty !== "hardcore" || hardcore?.unlocked)
              .map((pool) => ({ value: pool.difficulty, label: pool.label }))}
            selected={difficulty}
            testId="emoji-difficulty"
          />
        }
      />
      {difficulty === "hardcore" && !hardcore?.unlocked ? (
        <section className="emoji__locked emoji-stage" aria-live="polite">
          <p className="eyebrow">
            <FaLock aria-hidden /> Hardcore locked
          </p>
          <h2>Complete Classic / Challenge in every category.</h2>
          <p>
            {completed.length} / {hardcore?.requiredCategories.length ?? 0} categories completed
            {!hardcore?.signedIn ? ". Sign in to track progress." : "."}
          </p>
          <ul>
            {(hardcore?.requiredCategories ?? []).map((category) => (
              <li key={category}>
                {completed.includes(category) ? "✓" : "○"}{" "}
                {category.replace("od", "object detection").replaceAll("-", " ")}
              </li>
            ))}
          </ul>
        </section>
      ) : isLoadingGame ? (
        <GameLoadingState className="emoji-stage" label="Loading today’s Emoji…" />
      ) : game ? (
        <section className="emoji emoji-stage" aria-label="Visual clues and guesses">
          <ol className="emoji__clues" aria-label="Visual clues">
            {Array.from({ length: game.challenge.maximumClues }, (_, index) => {
              const clue = game.challenge.clues[index];
              const revealed = Boolean(clue);
              return (
                <li
                  className={[
                    "emoji__clue",
                    revealed ? " emoji__clue--revealed" : " emoji__clue--hidden",
                    solved ? " emoji__clue--solved" : "",
                  ].join("")}
                  key={`${index}-${clueKey(clue)}`}
                  style={{ "--clue-index": index } as CSSProperties}
                >
                  <div className="emoji__clue-inner">
                    <span aria-hidden="true" className="emoji__clue-face emoji__clue-cover">
                      ?
                    </span>
                    <span className="emoji__clue-face emoji__clue-result">
                      {clue?.type === "emoji" ? (
                        <span
                          className={
                            clue.action === "replace"
                              ? "emoji__glyph emoji__glyph--replacement"
                              : "emoji__glyph"
                          }
                        >
                          {clue.action === "replace" && clue.toValue?.includes("-") ? (
                            <>
                              <span className="emoji__replacement-emoji">{clue.value}</span>
                              <span
                                className="emoji__replacement"
                                aria-label={`${clue.toValue.split("-")[0]} replaced by ${clue.toValue.split("-")[1]}`}
                              >
                                <s>{clue.toValue.split("-")[0]}</s> + {clue.toValue.split("-")[1]}
                              </span>
                            </>
                          ) : (
                            clue.value
                          )}
                        </span>
                      ) : clue?.type === "icon" ? (
                        <EmojiIcon icon={clue.icon} />
                      ) : clue?.type === "image" ? (
                        <img alt={clue.alt ?? ""} src={clue.src} />
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {!solved && (
            <GameGuessAutocomplete
              className="emoji__search"
              disabled={busy}
              getOptionKey={(entity) => entity.id}
              idPrefix="emoji"
              inputContainerClassName="emoji__input"
              inputId="emoji-search"
              inputName="entity"
              label="Name the answer"
              onQueryChange={setQuery}
              onSelect={(entity) => void choose(entity)}
              options={available}
              placeholder="GPT, BERT, K-Means…"
              query={query}
              renderOption={(entity) => (
                <>
                  <strong>{entity.name}</strong>
                  <small>{entity.entityKind.replaceAll("-", " ")}</small>
                </>
              )}
              toolDescription="Choose the AI entity you think is the answer in the emoji game."
              toolName="guessEmojiEntity"
              toolParamDescription="The name of the AI entity to guess."
            />
          )}
          {guesses.length > 0 && (
            <ol className="emoji__history">
              {guesses.map((guess, index) => (
                <li
                  aria-label={
                    "Guess " +
                    (index + 1) +
                    ": " +
                    guess.name +
                    ", " +
                    (guess.isCorrect ? "correct" : "incorrect")
                  }
                  className={guess.isCorrect ? "is-correct" : "is-incorrect"}
                  key={guess.id}
                  style={{ "--result-index": index } as CSSProperties}
                >
                  <span>{index + 1}</span>
                  <strong>{guess.name}</strong>
                </li>
              ))}
            </ol>
          )}
          {solved && !showCompletion && (
            <div className="game-completion-action">
              <button className="button" onClick={() => setShowCompletion(true)} type="button">
                Show winning guess
              </button>
            </div>
          )}
        </section>
      ) : null}
      {Boolean(error) && (
        <ApiUnavailableState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
      )}
      <button
        aria-label="Emoji rules"
        aria-haspopup="dialog"
        className="game-help__button game-help__button--floating"
        onClick={() => setShowHowToPlay(true)}
        title="Use associations, not letter rebuses."
        type="button"
      >
        <FaCircleQuestion aria-hidden />
        <span>How to play</span>
      </button>
      <EmojiHTP
        hardcoreUnlocked={Boolean(hardcore?.unlocked)}
        open={showHowToPlay}
        onClose={() => setShowHowToPlay(false)}
      />
      {game && solved && showCompletion && (
        <Suspense fallback={null}>
          <EmojiCompletedDialog
            difficulty={difficulty}
            guessCount={guesses.length}
            clueCount={game.challenge.clues.length}
            globalCompletionCount={game.globalCompletionCount}
            onClose={() => setShowCompletion(false)}
          />
        </Suspense>
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
