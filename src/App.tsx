import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@components/auth/AuthProvider";
import { AuthenticatedRoute } from "@components/auth/AuthenticatedRoute";
import { DisabledAccountRoute } from "@components/auth/DisabledAccountRoute";
import { CookieConsent } from "@components/ui/CookieConsent";
import { GameLoadingState } from "@components/ui/GameLoadingState";
import { GlobalHellMode } from "@components/ui/GlobalHellMode";
import HomePage from "@app/pages/HomePage";
import { useAuth } from "@components/auth/useAuth";

const ProfilePage = lazy(() => import("@app/profile/page"));
const AdminPage = lazy(() => import("@app/admin/page"));
const CreditsPage = lazy(() => import("@app/credits/page"));
const PrivacyPage = lazy(() => import("@app/privacy/v1/page"));
const LoginPage = lazy(() => import("@app/pages/LoginPage"));
const RegisterPage = lazy(() => import("@app/pages/RegisterPage"));
const ResetPasswordPage = lazy(() => import("@app/pages/ResetPasswordPage"));
const ClassicPage = lazy(() => import("@app/pages/ClassicPage"));
const AccountDisabledPage = lazy(() => import("@app/pages/AccountDisabledPage"));
const DeleteAccountPage = lazy(() => import("@app/pages/DeleteAccountPage"));
const DeferredIssuePage = lazy(() => import("@app/pages/DeferredIssuePage"));
const ProgressSync = lazy(() =>
  import("@components/auth/ProgressSync").then(({ ProgressSync }) => ({ default: ProgressSync })),
);
const EmojiCluesGame = lazy(() =>
  import("@components/game/EmojiCluesGame").then(({ EmojiCluesGame }) => ({
    default: EmojiCluesGame,
  })),
);

function Content() {
  return (
    <>
      <ProgressSyncLoader />
      <GlobalHellMode />
      <Suspense
        fallback={
          <main className="page">
            <GameLoadingState label="Loading…" />
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/classic" element={<Navigate replace to="/classic/llm" />} />
          <Route path="/classic/:category" element={<ClassicPage />} />
          <Route path="/emoji" element={<EmojiCluesGame />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<DisabledAccountRoute />}>
            <Route path="/account-disabled" element={<AccountDisabledPage />} />
          </Route>
          <Route element={<AuthenticatedRoute />}>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/delete-account" element={<DeleteAccountPage />} />
          </Route>
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
    </>
  );
}

function ProgressSyncLoader() {
  const { user } = useAuth();

  if (!user || user.disabled) return null;

  return (
    <Suspense fallback={null}>
      <ProgressSync />
    </Suspense>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Content />
    </AuthProvider>
  );
}
