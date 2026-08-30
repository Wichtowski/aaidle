import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const installPromptDismissedAtKey = "aaidle_install_prompt_dismissed_at";
const installPromptDismissDuration = 24 * 60 * 60 * 1_000;

function wasInstallPromptDismissedRecently() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(installPromptDismissedAtKey));
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < installPromptDismissDuration;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const { pathname } = useLocation();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(wasInstallPromptDismissedRecently);
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 560px)").matches,
  );

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handleInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const handleInstalled = () => setInstallEvent(null);

    window.addEventListener("beforeinstallprompt", handleInstallAvailable);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallAvailable);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 560px)");
    const handleChange = () => setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!dismissed) return;

    const timeout = window.setTimeout(() => setDismissed(false), installPromptDismissDuration);
    return () => window.clearTimeout(timeout);
  }, [dismissed]);

  if (!installEvent || dismissed || !isMobile || pathname !== "/profile") return null;

  const install = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "dismissed") dismiss();
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(installPromptDismissedAtKey, String(Date.now()));
    } catch {
      // Ignore storage failures and keep the dismissal effective for this session
    }
  };

  return (
    <aside aria-label="Install aAIdle" className="install-prompt">
      <div>
        <strong>Take aAIdle with you</strong>
        <p>Install the daily game for quick access from your home screen.</p>
      </div>
      <div className="install-prompt__actions">
        <button className="button button--primary" onClick={() => void install()} type="button">
          Install
        </button>
        <button aria-label="Dismiss install prompt" className="button" onClick={dismiss} type="button">
          Not now
        </button>
      </div>
    </aside>
  );
}
