import { useId, useLayoutEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { canManageUsers } from "@lib/auth/permissions";
import { SignOutConfirmation } from "../auth/SignOutConfirmation";
import { useAuth } from "../auth/useAuth";
import { BuyMeCoffeeLink } from "./BuyMeCoffeeLink";

const hellModeStorageKey = "aaidle:hell-mode:v1";

function savedHellMode() {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return false;
  }
  return window.localStorage.getItem(hellModeStorageKey) === "1";
}

function useHellModeEnabled(user: ReturnType<typeof useAuth>["user"], hardcoreUnlocked: boolean) {
  const [saved, setSaved] = useState(savedHellMode);

  useLayoutEffect(() => {
    const sync = () => setSaved(savedHellMode());
    window.addEventListener("storage", sync);
    window.addEventListener("aaidle:hell-mode-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("aaidle:hell-mode-change", sync);
    };
  }, []);

  return Boolean(user && hardcoreUnlocked && saved);
}

export function SiteNavbar({
  children,
  hardcore = false,
}: {
  children?: ReactNode;
  hardcore?: boolean;
}) {
  const { hardcoreUnlocked, unavailable, user, signOut, retry } = useAuth();
  const hellModeEnabled = useHellModeEnabled(user, hardcoreUnlocked);
  const infernal = hardcore || hellModeEnabled;
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutConfirmationOpen, setSignOutConfirmationOpen] = useState(false);
  const menuId = useId();
  const labels = infernal
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
    <>
      <nav aria-label="Main navigation" className="site-navbar">
        <Link aria-label="aAIdle home" className="brand" to="/">
          a<span>AI</span>dle
        </Link>
        <button
          aria-controls={menuId}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="site-navbar__menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        <div
          className={`site-navbar__actions${menuOpen ? " site-navbar__actions--open" : ""}`}
          id={menuId}
          onClick={() => setMenuOpen(false)}
        >
          {children}
          {unavailable && (
            <button className="site-navbar__auth" onClick={retry} type="button">
              Reconnect
            </button>
          )}
          <Link to="/profile" prefetch="intent">
            {labels.profile}
          </Link>
          {user && canManageUsers(user.permission) && (
            <Link to="/admin" prefetch="intent">
              Admin
            </Link>
          )}
          <Link to="/privacy/v1" prefetch="intent">
            {labels.privacy}
          </Link>
          <Link to="/credits" prefetch="intent">
            {labels.credits}
          </Link>
          {user && !user.disabled && (
            <Link to="/report-issue" prefetch="intent">
              {labels.issues}
            </Link>
          )}
          {user ? (
            <button
              className="site-navbar__auth"
              onClick={() => setSignOutConfirmationOpen(true)}
              type="button"
            >
              {labels.signOut}
            </button>
          ) : (
            <Link to="/login">{labels.signIn}</Link>
          )}
          <BuyMeCoffeeLink hardcore={infernal} />
        </div>
      </nav>
      <SignOutConfirmation
        onClose={() => setSignOutConfirmationOpen(false)}
        onConfirm={signOut}
        open={signOutConfirmationOpen}
      />
    </>
  );
}
