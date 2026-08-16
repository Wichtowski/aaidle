import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaXmark } from "react-icons/fa6";
import { CelebrationPhysics } from "./CelebrationPhysics";
import { ShareResultButton, type ShareGuess } from "./ShareResultButton";
import type { ClassicCategory, ComparableModel } from "@lib/domain/models/model-types";
import { CompletionTrajectory } from "./CompletionTrajectory";
import { ModelSpaceTrajectory } from "./ModelSpaceTrajectory";
import { apiClient } from "@lib/api/client";

function resultMessage(guessCount: number) {
  if (guessCount === 1) return "One guess. Either genius or delightfully suspicious.";
  if (guessCount <= 3) return "That was almost unfair to the rest of the model zoo.";
  if (guessCount <= 6) return "Crisp work. You clearly read the clues.";
  if (guessCount <= 10) return "You found it. The detour was merely… research.";
  return "Technically solved. The models had time to form a support group.";
}

function hardcoreResultMessage(guessCount: number) {
  if (guessCount === 1) return "One offering. The abyss answered before it learned your name.";
  if (guessCount <= 3) return "The pit yielded quickly. Do not mistake this for mercy.";
  if (guessCount <= 6) return "You followed the embers and found the mark.";
  if (guessCount <= 10) return "The ledger endured your search. The answer finally surfaced.";
  return "The underworld counted every offering. At last, it accepted one.";
}

type LedgerCorruption = "clear" | "frayed" | "corrupted" | "lost";

function ledgerCorruption(guessCount: number): LedgerCorruption {
  if (guessCount <= 3) return "clear";
  if (guessCount <= 6) return "frayed";
  if (guessCount <= 10) return "corrupted";
  return "lost";
}

const ledgerEcho: Record<LedgerCorruption, string> = {
  clear: "",
  frayed: "THE LEDGER RECORDED // THE LEDGER RECORDED",
  corrupted: "THE L E D G E R  RECORDED  //  SEALS // SEALS",
  lost: "THE L[ED]GER // RECORDED // R E C O R D E D // [PROFILE]",
};

export function GameCompletedDialog({
  date,
  challengeId,
  category,
  difficulty,
  guesses,
  onClose,
  ritualNotice,
  stats,
}: {
  date: string;
  challengeId: string;
  category: ClassicCategory;
  difficulty: "normal" | "challenge" | "hardcore";
  guesses: Array<
    ShareGuess & {
      attemptNumber: number;
      isCorrect: boolean;
      model: ComparableModel;
      trajectoryAccessToken?: string;
    }
  >;
  onClose: () => void;
  ritualNotice?: string;
  stats: { currentStreak: number; bestStreak: number; gamesPlayed: number } | null;
}) {
  const [open, setOpen] = useState(true);
  const [celebrationComplete, setCelebrationComplete] = useState(false);
  const [referenceModels, setReferenceModels] = useState<ComparableModel[] | null>(null);
  const modalRef = useRef<HTMLElement>(null);
  const corruption = ledgerCorruption(guesses.length);
  const isHardcore = difficulty === "hardcore";
  const trajectoryAccessToken = guesses.find((guess) => guess.isCorrect)?.trajectoryAccessToken;
  const completeCelebration = useCallback(() => setCelebrationComplete(true), []);

  useEffect(() => {
    if (!celebrationComplete) return;

    const controller = new AbortController();

    void apiClient
      .classicTrajectory(challengeId, trajectoryAccessToken, controller.signal)
      .then(({ models }) => {
        if (!controller.signal.aborted) setReferenceModels(models);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReferenceModels([]);
      });

    return () => controller.abort();
  }, [celebrationComplete, challengeId, trajectoryAccessToken]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    onClose();
  };

  return (
    <div
      className={`completed-modal${isHardcore ? " completed-modal--hardcore" : ""}`}
      role="dialog"
      aria-labelledby="completed-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <CelebrationPhysics obstacleRef={modalRef} onComplete={completeCelebration} />
      <section className={`completed${isHardcore ? " completed--hardcore" : ""}`} ref={modalRef}>
        <button aria-label="Close completion dialog" className="completed__close" onClick={close}>
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">{isHardcore ? "The pit relented" : "Model identified"}</p>
        <h2 id="completed-title">{isHardcore ? "It has been named." : "Excellent work."}</h2>
        <p className="completed__message">
          {isHardcore ? hardcoreResultMessage(guesses.length) : resultMessage(guesses.length)}
        </p>
        {ritualNotice && (
          <p
            className={`completed__ritual-notice completed__ritual-notice--${corruption}`}
            data-ledger-echo={ledgerEcho[corruption]}
          >
            <Link to="/profile">{ritualNotice}</Link>
          </p>
        )}
        <div className="completed__stats" aria-label="Your game statistics">
          <div>
            <strong>{guesses.length}</strong>
            <span>{isHardcore ? "Offerings" : "Guesses"}</span>
          </div>
          <div>
            <strong>{stats?.currentStreak ?? 0}</strong>
            <span>{isHardcore ? "Survival streak" : "Streak"}</span>
          </div>
          <div>
            <strong>{stats?.bestStreak ?? 0}</strong>
            <span>{isHardcore ? "Longest survival" : "Best streak"}</span>
          </div>
          <div>
            <strong>{stats?.gamesPlayed ?? 0}</strong>
            <span>{isHardcore ? "Escapes" : "Solved games"}</span>
          </div>
        </div>
        {!celebrationComplete || referenceModels === null ? (
          <section
            aria-busy="true"
            aria-live="polite"
            className="completed-trajectory-loading"
            role="status"
          >
            <span aria-hidden="true" className="completed-trajectory-loading__spinner" />
            <span>Preparing your trajectory…</span>
          </section>
        ) : (
          <>
            <CompletionTrajectory category={category} difficulty={difficulty} guesses={guesses} />
            {referenceModels.length > 0 && (
              <ModelSpaceTrajectory
                category={category}
                guesses={guesses}
                referenceModels={referenceModels}
              />
            )}
          </>
        )}
        <div className="completed__actions">
          <ShareResultButton
            date={date}
            category={category}
            difficulty={difficulty}
            guesses={guesses}
            streak={stats?.currentStreak ?? 0}
          />
        </div>
      </section>
    </div>
  );
}
