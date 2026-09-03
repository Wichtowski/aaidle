import { useEffect, useState, type CSSProperties } from "react";
import type { LogoProgress } from "@lib/api/client";
import { FaCircleQuestion } from "react-icons/fa6";
import { useLogoClueViews } from "@lib/storage/use-logo-clue-views";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { useAuth } from "../../auth/useAuth";
import { LogoClues } from "./LogoClues";
import { utcDate } from "@lib/utils/dates";
import { SiteNavbar } from "../../ui/SiteNavbar";
import { ApiUnavailableState } from "../../ui/ApiUnavailableState";
import { GameLoadingState } from "../../ui/GameLoadingState";
import { Toast } from "../../ui/Toast";
import { GameGuessAutocomplete } from "../common";
import { GameEyebrow } from "../common/layout/GameEyebrow";
import { GameIntro } from "../common/layout/GameLayout";
import { LogoHTP } from "./LogoHTP";
import { LogoCompletedDialog } from "./LogoCompletedDialog";
import { LogoShareButton } from "./LogoShareButton";
import { useLogoGame } from "./use-logo-game";

function ProgressiveImage({ progress }: { progress: LogoProgress }) {
  const { imageUrl: src, imageRevision: revision, solved } = progress;
  const isBlur = progress.revealProfile === "gaussian-blur";
  const zoomLevels = [4.2, 3.5, 2.9, 2.4, 2, 1.65, 1.3, 1];
  const zoom = isBlur ? 1 : zoomLevels[Math.min(revision, zoomLevels.length - 1)];
  const blur = isBlur
    ? Math.max(0, progress.blurStartStrength - revision * progress.blurStepStrength)
    : 0;
  const [displayedSrc, setDisplayedSrc] = useState(src);
  const [displayedSolved, setDisplayedSolved] = useState(solved);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (src === displayedSrc) {
      setDisplayedSolved(solved);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      setDisplayedSrc(src);
      setDisplayedSolved(solved);
      setFailed(false);
    };
    image.onerror = () => {
      if (active) setFailed(true);
    };
    image.src = src;
    return () => {
      active = false;
    };
  }, [displayedSrc, solved, src]);

  return (
    <div className="logo-clue__image-wrap">
      <img
        alt={displayedSolved ? "Fully revealed logo" : `Visual clue at reveal ${revision + 1}`}
        className={`logo-clue__image${isBlur ? " is-blur-profile" : ""}${displayedSolved ? " is-solved" : ""}`}
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
        src={displayedSrc}
        style={
          {
            "--logo-solve-start-zoom": zoom,
            "--logo-solve-start-blur": `${blur}px`,
            transformOrigin:
              progress.revealProfile === "progressive-zoom"
                ? `${(progress.focalPoint.x / 512) * 100}% ${(progress.focalPoint.y / 512) * 100}%`
                : "center",
          } as CSSProperties
        }
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
    available,
    busy,
    choose,
    error,
    game,
    guesses,
    loading,
    query,
    setLoadAttempt,
    setQuery,
    setToast,
    setShowCompletion,
    showCompletion,
    solved,
    toast,
  } = useLogoGame();
  const { playerId } = useLocalProgress();
  const { user } = useAuth();
  const clueScope = user?.id ?? playerId;
  const { viewedClues, markViewed } = useLogoClueViews(clueScope, game?.challenge.id);
  const usedClueCount = viewedClues.filter((index) => game?.progress.clues[index]).length;
  const winningGuess = guesses.find((guess) => guess.isCorrect);

  return (
    <main className="page game-page logo-page">
      <SiteNavbar />
      <GameIntro
        completionCount={solved ? (game?.globalCompletionCount ?? null) : null}
        description={
          game?.progress.revealProfile === "gaussian-blur"
            ? "Guess carefully, and watch the image become clearer after each miss."
            : "Start close, guess carefully, and watch the image zoom out after each miss."
        }
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
          {!solved && (
            <GameGuessAutocomplete
              className="logo-search"
              confirmLabel={busy ? "Checking…" : "Guess"}
              disabled={busy}
              fieldClassName="logo-search__controls"
              getOptionKey={(model) => model.id}
              idPrefix="logo"
              inputContainerClassName="logo-search__input"
              inputId="logo-search"
              inputName="model"
              label="Name the answer"
              onQueryChange={setQuery}
              onSelect={(model) => void choose(model)}
              options={available}
              placeholder="Search the curated pool…"
              query={query}
              renderOption={(model) => (
                <>
                  <strong>{model.name}</strong>
                  <small>{model.providerName}</small>
                </>
              )}
              toolDescription="Choose the AI model, algorithm, or technology shown in the Logo game."
              toolName="guessLogoAnswer"
              toolParamDescription="The name of the Logo game answer."
            />
          )}

          <div className="logo-clue-layout">
            <LogoClues
              key={`${clueScope}:${game.challenge.id}`}
              clues={game.progress.clues}
              viewedClues={viewedClues}
              onView={markViewed}
            />
            <div className="logo-clue">
              <ProgressiveImage progress={game.progress} />
              <p className="logo-clue__progress">
                Reveal {game.progress.imageRevision + 1} of {game.progress.maximumImageRevision + 1}
              </p>
            </div>
            <span aria-hidden="true" />
          </div>

          {guesses.length > 0 && (
            <ol className="logo-history" aria-label="Logo guesses">
              {guesses.map((guess, index) => (
                <li
                  className={guess.isCorrect ? "is-correct" : "is-incorrect"}
                  key={guess.model.id}
                  style={{ "--result-index": index } as CSSProperties}
                >
                  <span>{guess.attemptNumber}</span>
                  <strong>{guess.model.name}</strong>
                  <small>{guess.isCorrect ? "Correct" : "Incorrect"}</small>
                </li>
              ))}
            </ol>
          )}

          {solved && !showCompletion && (
            <div className="game-completion-action">
              <button className="button" onClick={() => setShowCompletion(true)} type="button">
                Show winning guess
              </button>
            </div>
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
      {game && solved && showCompletion && (
        <LogoCompletedDialog
          answer={winningGuess?.model.name ?? "Winning guess"}
          clueCount={usedClueCount}
          globalCompletionCount={game.globalCompletionCount}
          guessCount={guesses.length}
          onClose={() => setShowCompletion(false)}
          shareAction={<LogoShareButton guessCount={guesses.length} clueCount={usedClueCount} />}
        />
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
