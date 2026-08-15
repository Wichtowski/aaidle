import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { AuthProvider } from "./components/auth/AuthProvider";
import { ProgressSync } from "./components/auth/ProgressSync";
import { CookieConsent } from "./components/ui/CookieConsent";
import { GlobalHellMode } from "./components/ui/GlobalHellMode";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { userForSession } from "@/lib/auth/auth-service";
import { database } from "@/lib/db/client";
import { localProgressSchema } from "@/lib/storage/local-progress-schema";

export const metadata: Metadata = {
  metadataBase: new URL("https://aaidle.com"),
  title: {
    default: "aAIdle | Daily AI Model Guessing Game",
    template: "%s | aAIdle",
  },
  description:
    "Play a new daily AI model guessing game. Compare model clues, make your guess, and build your streak.",
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
    images: [
      { url: "/opengraph-image", width: 1200, height: 630, alt: "aAIdle daily AI model game" },
    ],
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

const hellModeBootstrap = `
try {
  const appearance = localStorage.getItem("aaidle:hell-mode:v1");
  const innerCircle = JSON.parse(localStorage.getItem("aaidle:inner-circle:v1") || "null");
  const progress = JSON.parse(localStorage.getItem("aaidle:progress:v1") || "null");
  const preferences = progress && progress.preferences;
  const legacyEnabled = Boolean(
    (innerCircle && innerCircle.hardcoreUnlocked === true && innerCircle.hellMode === true) ||
    (preferences && preferences.hardcoreUnlocked === true && preferences.hellMode === true)
  );
  const enabled = appearance === null ? legacyEnabled : appearance === "1";
  document.documentElement.classList.toggle("hell-mode", enabled);
} catch {}
`;

async function hasPersistedHellMode() {
  const cookieStore = await cookies();
  const appearanceCookie = cookieStore.get("aaidle_hell_mode")?.value;
  if (appearanceCookie === "1") return true;
  if (appearanceCookie === "0") return false;

  const user = await userForSession(cookieStore.get(sessionCookieName)?.value ?? null);
  if (!user) return false;

  const record = await database()
    .prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
    .bind(user.id)
    .first<{ progress_json: string }>();
  if (!record) return false;

  try {
    const progress = localProgressSchema.safeParse(JSON.parse(record.progress_json));
    return Boolean(
      progress.success &&
      progress.data.preferences.hardcoreUnlocked &&
      progress.data.preferences.hellMode,
    );
  } catch {
    return false;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const hellModeEnabled = await hasPersistedHellMode();

  return (
    <html
      className={hellModeEnabled ? "hell-mode" : undefined}
      lang="en"
      suppressHydrationWarning
      {...{ version }}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: hellModeBootstrap }} />
        <link href="/llms.txt" rel="describedby" />
        <link href="/openapi.json" rel="alternate" type="application/json" />
        {process.env.NODE_ENV === "development" && (
          <script dangerouslySetInnerHTML={{ __html: resizeObserverErrorGuard }} />
        )}
      </head>
      <body className={hellModeEnabled ? "hell-mode" : undefined}>
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
