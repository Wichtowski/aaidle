import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

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

  if (!installEvent || dismissed) return null;

  const install = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "dismissed") setDismissed(true);
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
        <button aria-label="Dismiss install prompt" className="button" onClick={() => setDismissed(true)} type="button">
          Not now
        </button>
      </div>
    </aside>
  );
}
