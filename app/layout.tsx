import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./components/auth/AuthProvider";
import { ProgressSync } from "./components/auth/ProgressSync";
import { CookieConsent } from "./components/ui/CookieConsent";
import { GlobalHellMode } from "./components/ui/GlobalHellMode";

export const metadata: Metadata = {
  metadataBase: new URL("https://aaidle.com"),
  title: {
    default: "aAIdle | Daily AI Model Guessing Game",
    template: "%s | aAIdle",
  },
  description: "Play a new daily AI model guessing game. Compare model clues, make your guess, and build your streak.",
  applicationName: "aAIdle",
  category: "games",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "aAIdle",
    url: "/",
    title: "aAIdle | Daily AI Model Guessing Game",
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

const resizeObserverErrorGuard = `
window.addEventListener("error", function (event) {
  if (
    event.message === "ResizeObserver loop completed with undelivered notifications." ||
    event.message === "ResizeObserver loop limit exceeded"
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...{ version }}>
      <head>
        <link href="/llms.txt" rel="describedby" />
        <link href="/openapi.json" rel="alternate" type="application/json" />
        {process.env.NODE_ENV === "development" && (
          <script dangerouslySetInnerHTML={{ __html: resizeObserverErrorGuard }} />
        )}
      </head>
      <body>
        <AuthProvider>
          <ProgressSync />
          <GlobalHellMode />
          {children}
          <CookieConsent />
        </AuthProvider>
      </body>
    </html>
  );
}
