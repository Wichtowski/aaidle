import { Button } from "@components/ui/Button";
import { FaArrowRight } from "react-icons/fa6";
import { AppPageLayout } from "@app/layouts/AppPageLayout";

type GameModeCard = {
  title: string;
  description: string;
  path: string;
  status?: "Available now" | "new game" | "new speedrun mode" | "in progress";
  testId?: string;
};

const gameModes: GameModeCard[] = [
  {
    title: "Classic",
    description: "Use model metadata and comparison clues to find today’s answer.",
    path: "/classic",
  },
  {
    title: "Emoji",
    description: "Recognize AI systems and algorithms from visual associations.",
    path: "/emoji",
    testId: "home-play-emoji",
  },
  {
    title: "Timeline",
    description: "Arrange a limited set of AI models in release order.",
    path: "/timeline",
    status: "new speedrun mode",
    testId: "home-play-timeline",
  },
  {
    title: "Logo",
    description: "Identify an AI model or technology as its image progressively zooms out.",
    path: "/logo",
    status: "new game",
    testId: "home-play-logo",
  },
  {
    title: "Connections",
    description: "Find the hidden connections between different AI models and technologies.",
    path: "/connections",
    status: "in progress",
    testId: "home-play-connections",
  },
];

export function HomePage() {
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
          <Button variant="3d" data-testid="home-play-classic" to="/classic" prefetch="intent">
            <span>Play Classic</span> <FaArrowRight aria-hidden="true" />
          </Button>
        </div>
      </section>
      <section aria-labelledby="games-title" className="game-modes">
        <div className="game-modes__heading">
          <p className="eyebrow">Daily games</p>
          <h2 id="games-title">Choose your challenge</h2>
        </div>
        <div className="game-modes__grid">
          {gameModes.map(({ description, path, status, testId, title }) => {
            if (status === "in progress") {
              return (
                <div
                  aria-disabled="true"
                  className="game-mode-card game-mode-card--in-progress"
                  data-testid={testId}
                  key={path}
                >
                  <span>In progress</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <strong>Ongoing development</strong>
                </div>
              );
            }

            return (
              <Button
                variant="outline"
                className="game-mode-card"
                data-testid={testId}
                key={path}
                prefetch="intent"
                to={path}
              >
                {status && <span>{status}</span>}
                <h3>{title}</h3>
                <p>{description}</p>
                <strong>
                  Play {title} <FaArrowRight aria-hidden="true" />
                </strong>
              </Button>
            );
          })}
        </div>
      </section>
    </AppPageLayout>
  );
}
