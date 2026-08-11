import type { Metadata } from "next";
import "./globals.css";
import { CookieConsent } from "../components/ui/CookieConsent";
export const metadata: Metadata = {
  title: "AIdle — daily AI model game",
  description: "Guess today’s AI model.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
