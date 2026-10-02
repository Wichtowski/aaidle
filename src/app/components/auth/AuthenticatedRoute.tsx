import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { rememberReturnPath } from "@lib/storage/return-path";
import { GameLoadingState } from "../ui/GameLoadingState";
import { useAuth } from "./useAuth";

export function AuthenticatedRoute() {
  const { loading, user } = useAuth();
  const location = useLocation();
  const signedOut = !loading && !user;

  useEffect(() => {
    if (signedOut) rememberReturnPath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search, signedOut]);

  if (loading) {
    return (
      <main className="page">
        <GameLoadingState label="Checking your account…" />
      </main>
    );
  }

  if (!user) {
    return <Navigate replace to="/login" />;
  }

  if (user.disabled) {
    return <Navigate replace to="/account-disabled" />;
  }

  return <Outlet />;
}
