import { useEffect, useState } from "react";
import { FaCircleQuestion } from "react-icons/fa6";
import { utcDate } from "@lib/utils/dates";
import { SiteNavbar } from "../../ui/SiteNavbar";
import { ApiUnavailableState } from "../../ui/ApiUnavailableState";
import { GameLoadingState } from "../../ui/GameLoadingState";
import { Toast } from "../../ui/Toast";
import { GameEyebrow } from "../common/layout/GameEyebrow";
import { GameIntro } from "../common/layout/GameLayout";
import { LogoHTP } from "./LogoHTP";
import { useLogoGame } from "./use-logo-game";

function ProgressiveImage({
  focalPoint,
  src,
  revision,
}: {
  focalPoint: { x: number; y: number };
  src: string;
  revision: number;
}) {
  const zoomLevels = [4.2, 3.5, 2.9, 2.4, 2, 1.65, 1.3, 1];
  const zoom = zoomLevels[Math.min(revision, zoomLevels.length - 1)];
  const [displayedSrc, setDisplayedSrc] = useState(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (src === displayedSrc) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      setDisplayedSrc(src);
      setFailed(false);
    };
    image.onerror = () => {
      if (active) setFailed(true);
    };
    image.src = src;
    return () => {
      active = false;
    };
  }, [displayedSrc, src]);

  return (
    <div className="logo-clue__image-wrap">
      <img
        alt={`Visual clue at reveal ${revision + 1}`}
        className="logo-clue__image"
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
        src={displayedSrc}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: `${(focalPoint.x / 512) * 100}% ${(focalPoint.y / 512) * 100}%`,
        }}
      />
      {failed && (
        <p className="logo-clue__image-error" role="status">
          The image clue could not be loaded. Please try again shortly.
        </p>
      )}
    </div>
  );
}

export function LogoGame() {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const {
    activeOption,
    activeOptionIndex,
    available,
    busy,
    choose,
    error,
    game,
    guesses,
    loading,
    query,
    setActiveOptionIndex,
    setLoadAttempt,
    setQuery,
    setToast,
    solved,
    toast,
  } = useLogoGame();
  const winningGuess = guesses.find((guess) => guess.isCorrect);

  return (
    <main className="page game-page logo-page">
      <SiteNavbar />
      <GameIntro
        completionCount={solved ? (game?.globalCompletionCount ?? null) : null}
        description="Start close, guess carefully, and watch the image zoom out after each miss."
        expiresAt={game?.challenge.expiresAt ?? null}
        eyebrow={
          <GameEyebrow date={game?.challenge.date ?? utcDate()} game="Logo" variant="Normal" />
        }
        title={
          <>
            What is hiding in today’s <em>image</em>?
          </>
        }
        titleId="logo-title"
      />
      {loading ? (
        <GameLoadingState className="logo-loading-stage" label="Loading today’s Logo…" />
      ) : game ? (
        <section className="logo-stage" aria-label="Logo image, clues, and guesses">
          <div className="logo-clue">
            <ProgressiveImage
              focalPoint={game.progress.focalPoint}
              revision={game.progress.imageRevision}
              src={game.progress.imageUrl}
            />
            <p className="logo-clue__progress">
              Reveal {game.progress.imageRevision + 1} of {game.progress.maximumImageRevision + 1}
            </p>
          </div>

          {!solved && (
            <form
              className="logo-search"
              onSubmit={(event) => {
                event.preventDefault();
                if (activeOption) void choose(activeOption);
              }}
            >
              <label htmlFor="logo-search">Name the answer</label>
              <div className="logo-search__controls">
                <div className="logo-search__input">
                  <input
                    aria-activedescendant={
                      available.length ? `logo-option-${activeOptionIndex}` : undefined
                    }
                    aria-autocomplete="list"
                    aria-controls="logo-options"
                    aria-expanded={available.length > 0}
                    disabled={busy}
                    id="logo-search"
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveOptionIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (!available.length) return;
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActiveOptionIndex((index) => (index + 1) % available.length);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActiveOptionIndex(
                          (index) => (index - 1 + available.length) % available.length,
                        );
                      }
                    }}
                    placeholder="Search the curated pool…"
                    role="combobox"
                    value={query}
                  />
                  {available.length > 0 && (
                    <ul id="logo-options" role="listbox">
                      {available.map((model, index) => (
                        <li
                          aria-selected={index === activeOptionIndex}
                          id={`logo-option-${index}`}
                          key={model.id}
                          role="option"
                        >
                          <button onClick={() => void choose(model)} type="button">
                            <strong>{model.name}</strong>
                            <small>{model.providerName}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button className="autocomplete__confirm" disabled={!activeOption || busy}>
                  {busy ? "Checking…" : "Guess"}
                </button>
              </div>
            </form>
          )}

          {guesses.length > 0 && (
            <ol className="logo-history" aria-label="Logo guesses">
              {guesses.map((guess) => (
                <li
                  className={guess.isCorrect ? "is-correct" : "is-incorrect"}
                  key={guess.model.id}
                >
                  <span>{guess.attemptNumber}</span>
                  <strong>{guess.model.name}</strong>
                  <small>{guess.isCorrect ? "Correct" : "Incorrect"}</small>
                </li>
              ))}
            </ol>
          )}

          {game.progress.clues.length > 0 && (
            <section
              aria-labelledby="logo-unlocked-clues-title"
              className="logo-unlocked-clues"
              aria-live="polite"
            >
              <h2 id="logo-unlocked-clues-title">Unlocked clues</h2>
              <ol>
                {game.progress.clues.map((clue) => (
                  <li key={`${clue.afterIncorrectGuesses}:${clue.kind}`}>
                    <span>{clue.kind.replaceAll("-", " ")}</span>
                    <p>{clue.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {solved && winningGuess && (
            <section className="logo-complete" aria-live="polite">
              <p className="eyebrow">Image identified</p>
              <h2>{winningGuess.model.name}</h2>
              {game.progress.attribution && <p>{game.progress.attribution}</p>}
            </section>
          )}
        </section>
      ) : null}
      {Boolean(error) && (
        <ApiUnavailableState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
      )}
      <button
        aria-label="Logo rules"
        aria-haspopup="dialog"
        className="game-help__button game-help__button--floating"
        onClick={() => setShowHowToPlay(true)}
        type="button"
      >
        <FaCircleQuestion aria-hidden />
        <span>How to play</span>
      </button>
      <LogoHTP onClose={() => setShowHowToPlay(false)} open={showHowToPlay} />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
