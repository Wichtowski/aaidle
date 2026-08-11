import Link from "next/link";
import { FaArrowRight } from "react-icons/fa6";
export default function Home() {
  return (
    <main className="page home">
      <nav>
        <a className="brand" href="/">
          A<span>AI</span>dle
        </a>
        <div>
          <Link href="/stats">Stats</Link>
        </div>
      </nav>
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
