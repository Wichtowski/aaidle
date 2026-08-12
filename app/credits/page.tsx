import { SiteNavbar } from "../components/ui/SiteNavbar";

export default function CreditsPage() {
  return (
    <main className="page credits-page">
      <SiteNavbar />
      <section className="credits">
        <p className="eyebrow">The people behind the game</p>
        <h1>Credits</h1>
        <p className="credits__lede">
          Some games make a prompt the destination. aAidle begins somewhere wider.
        </p>
        <p>
          In an early conversation about the idea, Michał suggested looking beyond prompts.
          Artificial intelligence is a much broader landscape of models, systems,
          methods, and the people who make them useful. That thought set the direction for a game
          about finding the model behind the answer.
        </p>
        <dl className="credits__list">
          <div>
            <dt>App idea</dt>
            <dd><a href="https://www.linkedin.com/in/michalwojdylak/" target="_blank" rel="noopener noreferrer">Michał Wojdylak</a></dd>
          </div>
          <div>
            <dt>First game played by</dt>
            <dd><a href="https://www.linkedin.com/in/wojciech-piszczek/" target="_blank" rel="noopener noreferrer">Wojciech Piszczek</a></dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
