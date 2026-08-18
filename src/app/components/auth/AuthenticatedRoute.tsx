import { Navigate, Outlet } from "react-router-dom";
import { GameLoadingState } from "../ui/GameLoadingState";
import { useAuth } from "./useAuth";

export function AuthenticatedRoute() {
  const { loading, user } = useAuth();

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

  return <Outlet />;
}
