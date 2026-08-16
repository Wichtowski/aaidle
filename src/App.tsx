import { lazy, Suspense, useState } from "react";
import { FaArrowRight, FaImage, FaTimeline, FaTriangleExclamation } from "react-icons/fa6";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider } from "@components/auth/AuthProvider";
import { CookieConsent } from "@components/ui/CookieConsent";
import { GlobalHellMode } from "@components/ui/GlobalHellMode";
import { ProgressSync } from "@components/auth/ProgressSync";
import { LoginForm } from "@components/auth/LoginForm";
import { ResetPasswordForm } from "@components/auth/ResetPasswordForm";
import { SiteNavbar } from "@components/ui/SiteNavbar";
import { useAuth } from "@components/auth/useAuth";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { classicCategoryFromRouteSegment, isClassicDifficulty } from "@lib/domain/models/model-types";
import { apiClient } from "@lib/api/client";

const ProfilePage = lazy(() => import("@app/profile/page"));
const AdminPage = lazy(() => import("@app/admin/page"));
const CreditsPage = lazy(() => import("@app/credits/page"));
const PrivacyPage = lazy(() => import("@app/privacy/v1/page"));
const ClassicGame = lazy(() =>
  import("@components/game/ClassicGame").then(({ ClassicGame }) => ({ default: ClassicGame })),
);
const EmojiGame = lazy(() =>
  import("@components/game/EmojiGame").then(({ EmojiGame }) => ({ default: EmojiGame })),
);

function HomePage() {
  return (
    <main className="page home">
      <SiteNavbar />
      <section className="hero">
        <p className="eyebrow">A daily deduction game</p>
        <h1>Can you identify today’s <em>AI model?</em></h1>
        <p className="lede">A new challenge arrives at midnight UTC. Compare providers, capabilities, context windows, and more, one guess at a time.</p>
        <div className="hero__actions"><Link className="button button--primary" to="/classic"><span>Play Classic</span> <FaArrowRight aria-hidden /></Link></div>
      </section>
      <section aria-labelledby="games-title" className="game-modes">
        <div className="game-modes__heading"><p className="eyebrow">Daily games</p><h2 id="games-title">Choose your challenge</h2></div>
        <div className="game-modes__grid">
          <Link className="game-mode-card" to="/classic"><span>Available now</span><h3>Classic</h3><p>Use model metadata and comparison clues to find today’s answer.</p><strong>Play Classic <FaArrowRight aria-hidden /></strong></Link>
          <Link className="game-mode-card" to="/emoji"><span>Available now</span><h3>Emoji</h3><p>Decode today’s AI model family from progressive emoji clues.</p><strong>Play Emoji <FaArrowRight aria-hidden /></strong></Link>
          <article className="game-mode-card game-mode-card--in-progress"><span><FaTimeline aria-hidden /> In progress</span><h3>Timeline</h3><p>Arrange a limited set of AI models in release order.</p><strong>Coming soon</strong></article>
          <article className="game-mode-card game-mode-card--in-progress"><span><FaImage aria-hidden /> In progress</span><h3>Logo</h3><p>Identify a model from a distorted logo.</p><strong>Coming soon</strong></article>
        </div>
      </section>
    </main>
  );
}

function LoginPage() {
  return <main className="page login-page"><SiteNavbar /><section className="login"><p className="eyebrow">Your aAIdle account</p><h1>Keep your progress.</h1><p className="lede">Create your aAIdle profile for account features and future game modes.</p><LoginForm /></section></main>;
}

function ResetPasswordPage() {
  return <main className="page login-page"><SiteNavbar /><section className="login"><p className="eyebrow">Account recovery</p><h1>Set a new password.</h1><p className="lede">Choose a new password with at least 12 characters.</p><ResetPasswordForm /></section></main>;
}

function ClassicPage() {
  const { category: routeCategory } = useParams();
  const category = classicCategoryFromRouteSegment(routeCategory);
  const progress = useLocalProgress();
  const { user } = useAuth();
  if (!category) return <Navigate replace to="/classic/llm" />;
  const saved = document.cookie.match(/(?:^|; )aaidle_classic_difficulty=([^;]+)/)?.[1];
  const difficulty = category === "hardcore" ? "hardcore" : isClassicDifficulty(saved) && saved !== "hardcore" ? saved : "normal";
  return <ClassicGame category={category} difficulty={difficulty} hasHardcoreAccess={category !== "hardcore" || Boolean(user && progress.preferences.hardcoreUnlocked)} />;
}

function AccountDisabledPage() {
  return <main className="page account-disabled-page"><SiteNavbar /><section className="account-disabled-card"><p className="eyebrow">Account unavailable</p><h1>Your account has been disabled.</h1><p>You cannot access the games with this account. Contact support if you believe this is a mistake.</p></section></main>;
}

function DeleteAccountPage() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await apiClient.completeAccountDeletion();
      window.location.assign("/?account-deleted=true");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete the account.");
      setDeleting(false);
    }
  };
  return <main className="page prose delete-account-page"><SiteNavbar /><section className="delete-account-card"><FaTriangleExclamation aria-hidden /><p className="eyebrow">Final confirmation</p><h1>Delete your account?</h1><p>This permanently deletes your account, linked identities, active sessions, and unused authentication links. This cannot be undone.</p>{error && <p className="notice" role="alert">{error}</p>}<div className="danger-modal__actions"><Link className="button" to="/profile">Cancel</Link><button className="button button--danger-solid" disabled={deleting} onClick={() => void deleteAccount()} type="button">{deleting ? "Deleting…" : "Permanently delete account"}</button></div></section></main>;
}

function DeferredIssuePage() {
  return <main className="page issue-report-page"><SiteNavbar /><section className="issue-report"><div className="issue-report__content"><p className="eyebrow">Temporarily unavailable</p><h1>Report an issue.</h1><p className="lede">Issue reporting is unavailable until the deferred API v2 endpoint is implemented.</p></div></section></main>;
}

function Content() {
  return <>
    <ProgressSync />
    <GlobalHellMode />
    <Suspense fallback={<main className="page"><p className="notice">Loading…</p></main>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/classic" element={<Navigate replace to="/classic/llm" />} />
        <Route path="/classic/:category" element={<ClassicPage />} />
        <Route path="/emoji" element={<EmojiGame />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/delete-account" element={<DeleteAccountPage />} />
        <Route path="/account-disabled" element={<AccountDisabledPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/privacy" element={<Navigate replace to="/privacy/v1" />} />
        <Route path="/privacy/v1" element={<PrivacyPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/report-issue" element={<DeferredIssuePage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
    <CookieConsent />
  </>;
}

export function App() {
  return <AuthProvider><Content /></AuthProvider>;
}
