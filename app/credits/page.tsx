import { SiteNavbar } from "../components/ui/SiteNavbar";
import type { Metadata } from "next";
import { FaGithub } from "react-icons/fa6";
import { githubRepositoryUrl } from "@/lib/github/repository";

export const metadata: Metadata = {
  title: "Credits",
  description: "Meet the people behind aAIdle, the daily AI model guessing game.",
  alternates: { canonical: "/credits" },
};

export default function CreditsPage() {
  return (
    <main className="page credits-page">
      <SiteNavbar />
      <section className="credits">
        <p className="eyebrow">The people behind the game</p>
        <h1>Credits</h1>
        <p className="credits__lede">
          <span>Some games make a prompt the destination</span>
          <span>aAIdle begins somewhere wider</span>
        </p>
        <p>
          In an early conversation about the idea, Michał suggested looking beyond prompts.
          Artificial intelligence is a much broader landscape of models, systems, methods, and the
          people who make them useful. That thought set the direction for a game about finding the
          model behind the answer.
        </p>
        <dl className="credits__list">
          <div>
            <dt>Original app idea</dt>
            <dd>
              <a
                href="https://www.linkedin.com/in/michalwojdylak/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Michał Wojdylak
              </a>
            </dd>
          </div>
          <div>
            <dt>App creator &amp; implementation</dt>
            <dd>
              <a
                href="https://www.linkedin.com/in/oskar-wichtowski/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Oskar Wichtowski
              </a>
            </dd>
          </div>
          <div>
            <dt>First game played by</dt>
            <dd>
              <a
                href="https://www.linkedin.com/in/wojciech-piszczek/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Wojciech Piszczek
              </a>
            </dd>
          </div>
          <div>
            <dt>First production classic solved by</dt>
            <dd>
              <a
                href="https://www.linkedin.com/in/marcinkorcz/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Marcin Korcz
              </a>
            </dd>
          </div>
          <div>
            <dt>Linear & Non-Linear Filters Presentation</dt>
            <dd>
              <a
                href="https://www.linkedin.com/in/łukasz-waligóra-82b1b615b/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Łukasz Waligóra
              </a>
            </dd>
          </div>
        </dl>
        <a
          aria-label="View the aAIdle source code on GitHub"
          className="github-repository-link credits__repository-link"
          href={githubRepositoryUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <FaGithub aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}
