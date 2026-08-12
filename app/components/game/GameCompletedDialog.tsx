"use client";

import { useRef, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { CelebrationPhysics } from "./CelebrationPhysics";
import { ShareResultButton, type ShareGuess } from "./ShareResultButton";
import type { ClassicCategory } from "../../../lib/domain/models/model-types";

function resultMessage(guessCount: number) {
  if (guessCount === 1) return "One guess. Either genius or delightfully suspicious.";
  if (guessCount <= 3) return "That was almost unfair to the rest of the model zoo.";
  if (guessCount <= 6) return "Crisp work. You clearly read the clues.";
  if (guessCount <= 10) return "You found it. The detour was merely… research.";
  return "Technically solved. The models had time to form a support group.";
}

export function GameCompletedDialog({
  date,
  category,
  difficulty,
  guesses,
  stats,
}: {
  date: string;
  category: ClassicCategory;
  difficulty: "normal" | "challenge" | "hardcore";
  guesses: ShareGuess[];
  stats: { currentStreak: number; bestStreak: number; gamesPlayed: number } | null;
}) {
  const [open, setOpen] = useState(true);
  const modalRef = useRef<HTMLElement>(null);

  if (!open) return null;

  return (
    <div
      className="completed-modal"
      role="dialog"
      aria-labelledby="completed-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <CelebrationPhysics obstacleRef={modalRef} />
      <section className="completed" ref={modalRef}>
        <button
          aria-label="Close completion dialog"
          className="completed__close"
          onClick={() => setOpen(false)}
        >
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">Model identified</p>
        <h2 id="completed-title">Excellent work.</h2>
        <p className="completed__message">{resultMessage(guesses.length)}</p>
        <div className="completed__stats" aria-label="Your game statistics">
          <div>
            <strong>{guesses.length}</strong>
            <span>Guesses</span>
          </div>
          <div>
            <strong>{stats?.currentStreak ?? 0}</strong>
            <span>Streak</span>
          </div>
          <div>
            <strong>{stats?.bestStreak ?? 0}</strong>
            <span>Best streak</span>
          </div>
          <div>
            <strong>{stats?.gamesPlayed ?? 0}</strong>
            <span>Solved games</span>
          </div>
        </div>
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
