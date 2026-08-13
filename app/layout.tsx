import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./components/auth/AuthProvider";
import { CookieConsent } from "./components/ui/CookieConsent";
import { GlobalHellMode } from "./components/ui/GlobalHellMode";

export const metadata: Metadata = {
  metadataBase: new URL("https://aaidle.com"),
  title: {
    default: "aAIdle | Daily AI model game",
    template: "%s | aAIdle",
  },
  description: "A daily deduction game for people who know AI models.",
  applicationName: "aAIdle",
  keywords: ["AI models", "daily game", "AI quiz", "model guessing game"],
  openGraph: {
    type: "website",
    siteName: "aAIdle",
    title: "aAIdle | Daily AI model game",
    description: "Can you identify today’s AI model? Compare the clues and make your guess.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "aAIdle daily AI model game" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "aAIdle | Daily AI model game",
    description: "Can you identify today’s AI model? Compare the clues and make your guess.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  themeColor: "#e84f33",
};

const version = process.env.AAIDLE_VERSION ?? "dev";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...{ version }}>
      <body>
        <AuthProvider>
          <GlobalHellMode />
          {children}
          <CookieConsent />
        </AuthProvider>
      </body>
    </html>
  );
}
