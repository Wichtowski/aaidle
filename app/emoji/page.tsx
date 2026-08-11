import Link from "next/link";
import { FaArrowLeft, FaHourglassHalf } from "react-icons/fa6";
import { emojiGame } from "../../lib/domain/games/emoji/definition";

export default function EmojiPage() {
  return (
    <main className="page game-placeholder-page">
      <nav>
        <a className="brand" href="/">
          a<span>A</span>idle
        </a>
        <Link href="/classic">Classic</Link>
      </nav>
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
        <Link className="button" href="/classic">
          <FaArrowLeft aria-hidden focusable="false" /> Play Classic while you wait
        </Link>
      </section>
    </main>
  );
}
