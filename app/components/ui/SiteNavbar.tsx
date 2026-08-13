"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "../auth/useAuth";
import { BuyMeCoffeeLink } from "./BuyMeCoffeeLink";

export function SiteNavbar({ children, hardcore = false }: { children?: ReactNode; hardcore?: boolean }) {
  const { user, signOut } = useAuth();
  const labels = hardcore
    ? { profile: "Soul", privacy: "Pacts", credits: "Infernal credits", issues: "Report a demon", signIn: "Enter the circle", signOut: "Leave the circle" }
    : { profile: "Profile", privacy: "Privacy", credits: "Credits", issues: "Report an issue", signIn: "Sign in", signOut: "Sign out" };

  return (
    <nav className="site-navbar">
      <Link aria-label="aAIdle home" className="brand" href="/">
        a<span>AI</span>dle
      </Link>
      <div className="site-navbar__actions">
        {children}
        <Link href="/profile">{labels.profile}</Link>
        <Link href="/privacy/v1">{labels.privacy}</Link>
        <Link href="/credits">{labels.credits}</Link>
        <a href="https://github.com/Wichtowski/aaidle/issues/new" rel="noreferrer" target="_blank">
          {labels.issues}
        </a>
        {user ? (
          <button className="site-navbar__auth" onClick={signOut} type="button">
            {labels.signOut}
          </button>
        ) : (
          <Link href="/login">{labels.signIn}</Link>
        )}
        <BuyMeCoffeeLink hardcore={hardcore} />
      </div>
    </nav>
  );
}
