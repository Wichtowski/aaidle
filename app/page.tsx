import Link from "next/link";
import type { Metadata } from "next";
import { FaArrowRight, FaHourglassHalf } from "react-icons/fa6";
import { SiteNavbar } from "./components/ui/SiteNavbar";
import { emojiGame } from "../lib/domain/games/emoji/definition";

export const metadata: Metadata = {
  title: "Daily AI Model Guessing Game",
  description: "Play today’s AI model guessing game. Use clues about providers, capabilities, context windows, and more to identify the model.",
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "aAIdle | Daily AI Model Guessing Game",
    description: "Can you identify today’s AI model? Compare the clues and make your guess.",
  },
};

const gameSchema = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "aAIdle",
  description: "A daily AI model guessing game where players compare clues to identify the featured model.",
  url: "https://aaidle.com",
  applicationCategory: "Game",
  genre: ["Puzzle", "Educational"],
  operatingSystem: "Any",
  isAccessibleForFree: true,
};

export default function Home() {
  return (
    <main className="page home">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(gameSchema).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <SiteNavbar />
      <section className="hero">
        <p className="eyebrow">A daily deduction game</p>
        <h1>
          Can you identify today’s <em>AI model?</em>
        </h1>
        <p className="lede">
          A new challenge arrives at midnight UTC. Compare providers, capabilities, context windows,
          and more—one guess at a time.
        </p>
        <div className="hero__actions">
          <Link className="button button--primary" href="/classic">
            Play Classic <FaArrowRight aria-hidden focusable="false" />
          </Link>
        </div>
      </section>
      <section aria-labelledby="games-title" className="game-modes">
        <div className="game-modes__heading">
          <p className="eyebrow">Daily games</p>
          <h2 id="games-title">Choose your challenge</h2>
        </div>
        <div className="game-modes__grid">
          <Link className="game-mode-card" href="/classic">
            <span>Available now</span>
            <h3>Classic</h3>
            <p>Use model metadata and comparison clues to find today’s answer.</p>
            <strong>
              Play Classic <FaArrowRight aria-hidden focusable="false" />
            </strong>
          </Link>
          <Link className="game-mode-card game-mode-card--in-progress" href="/emoji">
            <span>
              <FaHourglassHalf aria-hidden focusable="false" /> In progress
            </span>
            <h3>{emojiGame.name}</h3>
            <p>{emojiGame.summary}</p>
            <strong>View game details</strong>
          </Link>
        </div>
      </section>
      <section className="home-grid">
        <div>
          <span>01</span>
          <h2>Search a model</h2>
          <p>Choose from a growing index of real AI models and aliases.</p>
        </div>
        <div>
          <span>02</span>
          <h2>Read the signals</h2>
          <p>Every field tells you how close your guess is to today’s answer.</p>
        </div>
        <div>
          <span>03</span>
          <h2>Keep your streak</h2>
          <p>Your history stays on your device, with anonymous aggregate stats.</p>
        </div>
      </section>
    </main>
  );
}
