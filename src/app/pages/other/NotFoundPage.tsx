import { FaArrowRight, FaHouse } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { SiteNavbar } from "@components/ui/SiteNavbar";
import { PageEyebrow } from "@components/ui/PageEyebrow";
import { Button } from "@components/ui/Button";

export function NotFoundPage() {
  return (
    <main className="page not-found-page">
      <SiteNavbar />
      <section aria-labelledby="not-found-title" className="not-found">
        <span aria-hidden="true" className="not-found__code">
          404
        </span>
        <PageEyebrow>Wrong turn</PageEyebrow>
        <h1 id="not-found-title">This page isn’t in the catalogue.</h1>
        <p>
          The address you followed doesn’t lead to an available game or page. The timeline can
          wait—there’s always a model to identify.
        </p>
        <div className="not-found__actions">
          <Button variant="primary" color="black" to="/classic">
            Play Classic <FaArrowRight aria-hidden="true" />
          </Button>
          <Link className="not-found__classic-link" to="/">
            <FaHouse aria-hidden="true" /> Return to homepage
          </Link>
        </div>
      </section>
    </main>
  );
}
