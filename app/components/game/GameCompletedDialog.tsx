"use client";

import { useRef, useState } from "react";
import Link from "next/link";
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
  category,
  difficulty,
  guesses,
  onClose,
  ritualNotice,
  stats,
}: {
  date: string;
  category: ClassicCategory;
  difficulty: "normal" | "challenge" | "hardcore";
  guesses: ShareGuess[];
  onClose: () => void;
  ritualNotice?: string;
  stats: { currentStreak: number; bestStreak: number; gamesPlayed: number } | null;
}) {
  const [open, setOpen] = useState(true);
  const modalRef = useRef<HTMLElement>(null);
  const corruption = ledgerCorruption(guesses.length);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    onClose();
  };

  return (
    <div
      className="completed-modal"
      role="dialog"
      aria-labelledby="completed-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <CelebrationPhysics obstacleRef={modalRef} />
      <section className="completed" ref={modalRef}>
        <button
          aria-label="Close completion dialog"
          className="completed__close"
          onClick={close}
        >
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">Model identified</p>
        <h2 id="completed-title">Excellent work.</h2>
        <p className="completed__message">{resultMessage(guesses.length)}</p>
        {ritualNotice && (
          <p
            className={`completed__ritual-notice completed__ritual-notice--${corruption}`}
            data-ledger-echo={ledgerEcho[corruption]}
          >
            <Link href="/profile">{ritualNotice}</Link>
          </p>
        )}
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
