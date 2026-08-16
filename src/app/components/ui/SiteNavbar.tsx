import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { canManageUsers } from "@lib/auth/permissions";
import { useAuth } from "../auth/useAuth";
import { BuyMeCoffeeLink } from "./BuyMeCoffeeLink";

export function SiteNavbar({
  children,
  hardcore = false,
}: {
  children?: ReactNode;
  hardcore?: boolean;
}) {
  const { unavailable, user, signOut, retry } = useAuth();
  const labels = hardcore
    ? {
        profile: "Soul",
        privacy: "Pacts",
        credits: "Infernal credits",
        issues: "Report a demon",
        signIn: "Enter the circle",
        signOut: "Leave the circle",
      }
    : {
        profile: "Profile",
        privacy: "Privacy",
        credits: "Credits",
        issues: "Report an issue",
        signIn: "Sign in",
        signOut: "Sign out",
      };

  return (
    <nav className="site-navbar">
      <Link aria-label="aAIdle home" className="brand" to="/">
        a<span>AI</span>dle
      </Link>
      <div className="site-navbar__actions">
        {children}
        {unavailable && (
          <button className="site-navbar__auth" onClick={retry} type="button">
            Reconnect
          </button>
        )}
        <Link to="/profile">{labels.profile}</Link>
        {user && canManageUsers(user.permission) && <Link to="/admin">Admin</Link>}
        <Link to="/privacy/v1">{labels.privacy}</Link>
        <Link to="/credits">{labels.credits}</Link>
        {user && !user.disabled && <Link to="/report-issue">{labels.issues}</Link>}
        {user ? (
          <button className="site-navbar__auth" onClick={signOut} type="button">
            {labels.signOut}
          </button>
        ) : (
          <Link to="/login">{labels.signIn}</Link>
        )}
        <BuyMeCoffeeLink hardcore={hardcore} />
      </div>
    </nav>
  );
}
