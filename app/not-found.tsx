import Link from "next/link";
import { FaArrowLeft, FaArrowRight, FaMagnifyingGlass } from "react-icons/fa6";
import { SiteNavbar } from "./components/ui/SiteNavbar";

export default function NotFound() {
  return (
    <main className="page not-found-page">
      <SiteNavbar />

      <section className="not-found" aria-labelledby="not-found-title">
        <div className="not-found__code" aria-hidden="true">
          404
        </div>
        <p className="eyebrow">No match found</p>
        <h1 id="not-found-title">That model is not in our index.</h1>
        <p className="lede">
          The page you are looking for may have moved, or the link may be missing a few parameters.
        </p>
        <div className="not-found__actions">
          <Link className="button button--primary" href="/">
            <FaArrowLeft aria-hidden focusable="false" /> Back to home
          </Link>
          <Link className="not-found__classic-link" href="/classic">
            <FaMagnifyingGlass aria-hidden focusable="false" /> Try today’s challenge
            <FaArrowRight aria-hidden focusable="false" />
          </Link>
        </div>
      </section>
    </main>
  );
}
