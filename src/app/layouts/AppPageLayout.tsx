import type { ReactNode } from "react";
import { SiteNavbar } from "@components/ui/SiteNavbar";

type AppPageLayoutProps = {
  children: ReactNode;
  className?: string;
  navbar?: ReactNode;
};

export function AppPageLayout({
  children,
  className = "",
  navbar = <SiteNavbar />,
}: AppPageLayoutProps) {
  return (
    <main className={["page", className].filter(Boolean).join(" ")}>
      {navbar}
      {children}
    </main>
  );
}
