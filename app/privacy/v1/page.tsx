import { SiteNavbar } from "../../components/ui/SiteNavbar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Learn how aAIdle uses essential cookies and handles game and account data.",
  alternates: { canonical: "/privacy/v1" },
};

export default function PrivacyV1Page() {
  return (
    <main className="page">
      <SiteNavbar />
      <article className="prose privacy-page">
        <p className="eyebrow">
          Cookies &amp; privacy · Last updated <time dateTime="2026-08-12">12 August 2026</time>
        </p>
        <h1>The necessary corporate stuff.</h1>
        <p className="lede">
          aAIdle is a daily game, not a surveillance operation. We collect and use only what is needed
          to run the game, keep accounts secure, and make the experience work on your device.
        </p>
        <h2>What we store on your device</h2>
        <p>
          Your game progress, streak, preferences, and a random player identifier are stored in your
          browser&apos;s local storage. That information stays on your device unless your browser clears it.
        </p>
        <p>
          We also use essential cookies to remember your cookie choice and, if you sign in, to maintain
          a secure session. During sign-in with a provider, a short-lived security cookie helps protect
          the sign-in process.
        </p>

        <h2>What we do not do</h2>
        <ul>
          <li>We do not use advertising cookies or sell personal data</li>
          <li>We do not use third-party tracking cookies to follow you around the web</li>
          <li>We do not store your game history in an account unless that feature is clearly offered</li>
        </ul>

        <h2>Your choices</h2>
        <p>
          You can choose essential cookies only or accept all cookies from the consent dialog. At the
          moment, both choices keep only the cookies needed for aAIdle to work because we do not run
          advertising or analytics cookies.
        </p>
        <p>
          You can remove cookies and local storage at any time in your browser settings. Doing so resets
          your local game progress, preferences, and cookie choice. Signing out removes the active
          session cookie.
        </p>

        <h2>Changes to this page</h2>
        <p>
          If the way we use cookies or device data changes, we will update this page and ask for a new
          choice when required. If you have a question about this notice, please contact the aAIdle team
          through the project&apos;s public channels.
        </p>
      </article>
    </main>
  );
}
