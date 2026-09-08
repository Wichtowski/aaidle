import { useEffect, useRef, useState } from "react";
import { FaPause, FaPlay, FaVolumeHigh, FaVolumeXmark } from "react-icons/fa6";
import { dailyHardcoreSoundtrack } from "@lib/media/hardcore-soundtracks";
import { readProgress, updateProgress } from "@lib/storage/local-progress-store";

export function HardcoreSoundtrack() {
  const soundtrack = dailyHardcoreSoundtrack();
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasPlayed = useRef(false);
  const [volume, setVolume] = useState(5);
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioKey = soundtrack?.audioSources.map(({ url }) => url).join("|");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioKey) return;
    audio.volume = 0.1;
    const autoplay = readProgress().preferences.autoplayHardcoreSoundtrack !== false;
    if (readProgress().preferences.autoplayHardcoreSoundtrack === undefined) {
      updateProgress((state) => ({
        ...state,
        preferences: { ...state.preferences, autoplayHardcoreSoundtrack: true },
      }));
    }
    const retryAutoplay = () => {
      if (autoplay && !hasPlayed.current) void audio.play().catch(() => {});
    };
    const removeAutoplayFallback = () => {
      document.removeEventListener("keydown", retryAutoplay, true);
      document.removeEventListener("pointerdown", retryAutoplay, true);
    };
    const markAsPlayed = () => {
      setIsPlaying(true);
      if (hasPlayed.current) return;
      hasPlayed.current = true;
      removeAutoplayFallback();
      if (!readProgress().preferences.hasAutoplayedHardcoreSoundtrack) {
        updateProgress((state) => ({
          ...state,
          preferences: { ...state.preferences, hasAutoplayedHardcoreSoundtrack: true },
        }));
      }
    };

    const markAsPaused = () => setIsPlaying(false);

    hasPlayed.current = false;
    setIsPlaying(false);
    audio.addEventListener("play", markAsPlayed);
    audio.addEventListener("pause", markAsPaused);
    document.addEventListener("keydown", retryAutoplay, true);
    document.addEventListener("pointerdown", retryAutoplay, true);
    retryAutoplay();

    return () => {
      removeAutoplayFallback();
      audio.removeEventListener("play", markAsPlayed);
      audio.removeEventListener("pause", markAsPaused);
      audio.pause();
    };
  }, [audioKey]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      updateProgress((state) => ({
        ...state,
        preferences: { ...state.preferences, autoplayHardcoreSoundtrack: true },
      }));
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      updateProgress((state) => ({
        ...state,
        preferences: { ...state.preferences, autoplayHardcoreSoundtrack: false },
      }));
      audio.pause();
    }
  };

  if (!soundtrack) return null;

  return (
    <aside className="hardcore-soundtrack" aria-labelledby="hardcore-soundtrack-title">
      <a
        aria-label="Open the aAIdle Hardcore soundtrack notice in a new tab"
        className="hardcore-soundtrack__cover-link"
        href="/hardcore/SOUNDTRACK-NOTICE.txt"
        rel="noopener noreferrer"
        target="_blank"
        title="Open the soundtrack notice in a new tab"
      >
        <img alt="" className="hardcore-soundtrack__cover" src={soundtrack.coverUrl} />
      </a>
      <div className="hardcore-soundtrack__details">
        <span id="hardcore-soundtrack-title">{soundtrack.title}</span>
        <small>{soundtrack.artist}</small>
      </div>
      <label className="hardcore-soundtrack__volume">
        <span className="sr-only">Soundtrack volume</span>
        <input
          aria-label="Soundtrack volume"
          max="100"
          min="0"
          onChange={(event) => setVolume(Number(event.target.value))}
          type="range"
          value={volume}
        />
      </label>
      <button
        aria-label={muted ? "Unmute soundtrack" : "Mute soundtrack"}
        aria-pressed={muted}
        className="hardcore-soundtrack__mute"
        onClick={() => setMuted((current) => !current)}
        type="button"
      >
        {muted ? <FaVolumeXmark aria-hidden="true" /> : <FaVolumeHigh aria-hidden="true" />}
      </button>
      <button
        aria-label={isPlaying ? "Pause soundtrack" : "Play soundtrack"}
        className="hardcore-soundtrack__playback"
        onClick={togglePlayback}
        type="button"
      >
        {isPlaying ? <FaPause aria-hidden="true" /> : <FaPlay aria-hidden="true" />}
      </button>
      <audio
        aria-label={`${soundtrack.title} by ${soundtrack.artist} Hardcore soundtrack`}
        autoPlay={readProgress().preferences.autoplayHardcoreSoundtrack !== false}
        className="hardcore-soundtrack__audio"
        loop
        muted={muted}
        preload="auto"
        ref={audioRef}
      >
        {soundtrack.audioSources.map((source) => (
          <source key={source.fileName} src={source.url} type={source.mimeType} />
        ))}
      </audio>
    </aside>
  );
}
