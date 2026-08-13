import Link from "next/link";
import type { Metadata } from "next";
import { FaArrowLeft, FaHourglassHalf } from "react-icons/fa6";
import { SiteNavbar } from "../components/ui/SiteNavbar";
import { emojiGame } from "../../lib/domain/games/emoji/definition";

export const metadata: Metadata = {
  title: "Emoji game coming soon",
  description: "The aAIdle Emoji game is in development.",
  robots: { index: false, follow: true },
};

export default function EmojiPage() {
  return (
    <main className="page game-placeholder-page">
      <SiteNavbar />
      <section className="game-placeholder">
        <p className="eyebrow">{emojiGame.name} game</p>
        <div className="game-placeholder__status">
          <FaHourglassHalf aria-hidden focusable="false" /> In progress
        </div>
        <h1>Emoji is on its way.</h1>
        <p className="lede">{emojiGame.summary}</p>
        <dl>
          {emojiGame.details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <Link className="button game-placeholder__classic-link" href="/classic">
          <FaArrowLeft aria-hidden focusable="false" /> Play Classic while you wait
        </Link>
      </section>
    </main>
  );
}
