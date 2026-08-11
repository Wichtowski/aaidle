import type { Metadata } from "next";
import "./globals.css";
import { CookieConsent } from "./components/ui/CookieConsent";
export const metadata: Metadata = {
  title: "aAidle - daily AI model game",
  description: "Guess today’s AI model.",
};

const version = process.env.AAIDLE_VERSION ?? "dev";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...{ version }}>
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
