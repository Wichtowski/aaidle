import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "@components/auth/AuthProvider";
import { AuthenticatedRoute } from "@components/auth/AuthenticatedRoute";
import { DisabledAccountRoute } from "@components/auth/DisabledAccountRoute";
import { CookieConsent } from "@components/ui/CookieConsent";
import { GameLoadingState } from "@components/ui/GameLoadingState";
import { GlobalHellMode } from "@components/ui/GlobalHellMode";
import { HomePage } from "@app/pages/home/HomePage";
import { useAuth } from "@components/auth/useAuth";
import { SeoMetadata } from "@components/ui/SeoMetadata";
import { InstallPrompt } from "@components/ui/InstallPrompt";
import { NotFoundPage } from "@app/pages/other/NotFoundPage";

const ProfilePage = lazy(() => import("@app/pages/profile/ProfilePage").then(({ ProfilePage }) => ({ default: ProfilePage })));
const AdminPage = lazy(() => import("@app/pages/admin/AdminPage").then(({ AdminPage }) => ({ default: AdminPage })));
const CreditsPage = lazy(() => import("@app/pages/other/CreditsPage").then(({ CreditsPage }) => ({ default: CreditsPage })));
const PrivacyPage = lazy(() => import("@app/pages/other/PrivacyPage").then(({ PrivacyV1Page }) => ({ default: PrivacyV1Page })));
const LoginPage = lazy(() => import("@app/pages/auth/LoginPage").then(({ LoginPage }) => ({ default: LoginPage })));
const RegisterPage = lazy(() => import("@app/pages/auth/RegisterPage").then(({ RegisterPage }) => ({ default: RegisterPage })));
const ResetPasswordPage = lazy(() => import("@app/pages/auth/ResetPasswordPage").then(({ ResetPasswordPage }) => ({ default: ResetPasswordPage })));
const ClassicPage = lazy(() => import("@app/pages/game/ClassicPage").then(({ ClassicPage }) => ({ default: ClassicPage })));
const AccountDisabledPage = lazy(() => import("@app/pages/auth/AccountDisabledPage").then(({ AccountDisabledPage }) => ({ default: AccountDisabledPage })));
const DeleteAccountPage = lazy(() => import("@app/pages/auth/DeleteAccountPage").then(({ DeleteAccountPage }) => ({ default: DeleteAccountPage })));
const DeferredIssuePage = lazy(() => import("@app/pages/issues/DeferredIssuePage").then(({ DeferredIssuePage }) => ({ default: DeferredIssuePage })));
const TimelinePage = lazy(() => import("@app/pages/game/TimelinePage").then(({ TimelinePage }) => ({ default: TimelinePage })));
const EmojiPage = lazy(() => import("@app/pages/game/EmojiPage").then(({ EmojiPage }) => ({ default: EmojiPage })));
const ProgressSync = lazy(() =>
  import("@components/auth/ProgressSync").then(({ ProgressSync }) => ({ default: ProgressSync })),
);

function Content() {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (!loading && user?.disabled && location.pathname !== "/account-disabled") {
    return <Navigate replace to="/account-disabled" />;
  }

  return (
    <>
      <ProgressSyncLoader />
      <SeoMetadata />
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
          <Route path="/classic" element={<ClassicPage />} />
          <Route path="/classic/:category" element={<ClassicPage />} />
          <Route path="/emoji" element={<EmojiPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<DisabledAccountRoute />}>
            <Route path="/account-disabled" element={<AccountDisabledPage />} />
          </Route>
          <Route element={<AuthenticatedRoute />}>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/delete-account" element={<DeleteAccountPage />} />
            <Route path="/report-issue" element={<DeferredIssuePage />} />
          </Route>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/privacy" element={<Navigate replace to="/privacy/v1" />} />
          <Route path="/privacy/v1" element={<PrivacyPage />} />
          <Route path="/credits" element={<CreditsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <CookieConsent />
      <InstallPrompt />
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
