import { FaArrowRight, FaImage, FaTimeline } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { AppPageLayout } from "@app/layouts/AppPageLayout";

export default function HomePage() {
  return (
    <AppPageLayout className="home">
      <section className="hero">
        <p className="eyebrow">A daily deduction game</p>
        <h1 data-testid="home-heading">
          Can you identify today’s <em>AI model?</em>
        </h1>
        <p className="lede">
          A new challenge arrives at midnight UTC. Compare providers, capabilities, context windows,
          and more, one guess at a time.
        </p>
        <div className="hero__actions">
          <Link
            className="button button--primary"
            data-testid="home-play-classic"
            to="/classic"
            prefetch="render"
          >
            <span>Play Classic</span> <FaArrowRight aria-hidden />
          </Link>
        </div>
      </section>
      <section aria-labelledby="games-title" className="game-modes">
        <div className="game-modes__heading">
          <p className="eyebrow">Daily games</p>
          <h2 id="games-title">Choose your challenge</h2>
        </div>
        <div className="game-modes__grid">
          <Link className="game-mode-card" to="/classic" prefetch="intent">
            <span>Available now</span>
            <h3>Classic</h3>
            <p>Use model metadata and comparison clues to find today’s answer.</p>
            <strong>
              Play Classic <FaArrowRight aria-hidden />
            </strong>
          </Link>
          <Link
            className="game-mode-card"
            data-testid="home-play-emoji"
            to="/emoji"
            prefetch="intent"
          >
            <span>Available now</span>
            <h3>Emoji</h3>
            <p>Recognize AI systems and algorithms from visual associations.</p>
            <strong>
              Play Emoji <FaArrowRight aria-hidden />
            </strong>
          </Link>
          <article className="game-mode-card game-mode-card--in-progress">
            <span>
              <FaTimeline aria-hidden /> In progress
            </span>
            <h3>Timeline</h3>
            <p>Arrange a limited set of AI models in release order.</p>
            <strong>Coming soon</strong>
          </article>
          <article className="game-mode-card game-mode-card--in-progress">
            <span>
              <FaImage aria-hidden /> In progress
            </span>
            <h3>Logo</h3>
            <p>Identify a model from a distorted logo.</p>
            <strong>Coming soon</strong>
          </article>
        </div>
      </section>
    </AppPageLayout>
  );
}
