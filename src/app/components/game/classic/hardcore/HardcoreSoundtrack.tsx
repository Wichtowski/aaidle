import { useEffect, useRef, useState } from "react";
import { FaChevronDown, FaVolumeHigh } from "react-icons/fa6";
import { updateProgress } from "@lib/storage/local-progress-store";
import { useLocalProgress, useLocalProgressReady } from "@lib/storage/use-local-progress";
import { apiClient } from "@lib/api/client";

type SoundCloudWidget = {
  bind: (event: string, listener: () => void) => void;
  play: () => void;
  setVolume: (volume: number) => void;
};

type SoundCloudWidgetApi = {
  Widget: ((element: HTMLIFrameElement) => SoundCloudWidget) & {
    Events: { READY: string; PLAY: string };
  };
};

declare global {
  interface Window {
    SC?: SoundCloudWidgetApi;
  }
}

let widgetApiPromise: Promise<SoundCloudWidgetApi> | null = null;

function loadWidgetApi() {
  if (window.SC) return Promise.resolve(window.SC);
  if (widgetApiPromise) return widgetApiPromise;

  widgetApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.onload = () =>
      window.SC ? resolve(window.SC) : reject(new Error("SoundCloud widget did not load."));
    script.onerror = () => reject(new Error("SoundCloud widget could not load."));
    document.head.appendChild(script);
  });
  return widgetApiPromise;
}

export function HardcoreSoundtrack() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [volume, setVolume] = useState(25);
  const [minimized, setMinimized] = useState(false);
  const progress = useLocalProgress();
  const progressReady = useLocalProgressReady();
  const autoplayAttempted = useRef(false);

  useEffect(() => {
    let active = true;

    void apiClient
      .publicConfig()
      .then((config) => config.hardcoreSoundtrackUrl)
      .then((url) => {
        if (active) setTrackUrl(url);
      })
      .catch(() => {
        if (active) setTrackUrl(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!trackUrl || !iframe) return;

    let widget: SoundCloudWidget | null = null;
    void loadWidgetApi()
      .then((api) => {
        widget = api.Widget(iframe);
        widget.bind(api.Widget.Events.PLAY, () => {
          if (!progress.preferences.hasAutoplayedHardcoreSoundtrack) {
            updateProgress((state) => ({
              ...state,
              preferences: { ...state.preferences, hasAutoplayedHardcoreSoundtrack: true },
            }));
          }
        });
        widget.bind(api.Widget.Events.READY, () => {
          widget?.setVolume(volume);
          if (
            progressReady &&
            !progress.preferences.hasAutoplayedHardcoreSoundtrack &&
            !autoplayAttempted.current
          ) {
            autoplayAttempted.current = true;
            widget?.play();
          }
        });
      })
      .catch(() => {});

    return () => {
      widget = null;
    };
  }, [progress.preferences.hasAutoplayedHardcoreSoundtrack, progressReady, trackUrl]);

  if (!trackUrl) return null;

  const playerUrl = new URL("https://w.soundcloud.com/player/");
  playerUrl.searchParams.set("url", trackUrl);
  playerUrl.searchParams.set("auto_play", "false");
  playerUrl.searchParams.set("show_artwork", "true");
  playerUrl.searchParams.set("show_playcount", "false");
  playerUrl.searchParams.set("show_user", "true");
  playerUrl.searchParams.set("color", "d85a2d");

  return (
    <aside
      className="hardcore-soundtrack"
      data-minimized={minimized || undefined}
      aria-labelledby="hardcore-soundtrack-title"
    >
      <div className="hardcore-soundtrack__heading">
        <FaVolumeHigh aria-hidden="true" />
        <span id="hardcore-soundtrack-title">Soundtrack</span>
        <label className="hardcore-soundtrack__volume">
          <span className="sr-only">Soundtrack volume</span>
          <input
            aria-label="Soundtrack volume"
            max="100"
            min="0"
            onChange={(event) => {
              const nextVolume = Number(event.target.value);
              setVolume(nextVolume);
              if (iframeRef.current && window.SC) {
                window.SC.Widget(iframeRef.current).setVolume(nextVolume);
              }
            }}
            type="range"
            value={volume}
          />
        </label>
        <button
          aria-controls="hardcore-soundtrack-player"
          aria-expanded={!minimized}
          aria-label={minimized ? "Expand soundtrack player" : "Minimize soundtrack player"}
          className="hardcore-soundtrack__toggle"
          onClick={() => setMinimized((current) => !current)}
          type="button"
        >
          <FaChevronDown aria-hidden="true" />
        </button>
      </div>
      <div
        aria-hidden={minimized}
        className="hardcore-soundtrack__content"
        id="hardcore-soundtrack-player"
      >
        <iframe
          allow="autoplay"
          className="hardcore-soundtrack__player"
          loading="lazy"
          ref={iframeRef}
          src={playerUrl.toString()}
          tabIndex={minimized ? -1 : undefined}
          title="Hardcore soundtrack from SoundCloud"
        />
      </div>
    </aside>
  );
}
