import type { ReactNode } from "react";
import Link from "next/link";
import { BuyMeCoffeeLink } from "./BuyMeCoffeeLink";

export function SiteNavbar({ children }: { children?: ReactNode }) {
  return (
    <nav className="site-navbar">
      <Link aria-label="aAidle home" className="brand" href="/">
        a<span>AI</span>dle
      </Link>
      <div className="site-navbar__actions">
        {children}
        <Link href="/stats">Stats</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/credits">Credits</Link>
        <Link href="/login">Sign in</Link>
        <BuyMeCoffeeLink />
      </div>
    </nav>
  );
}
