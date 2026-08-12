"use client";

import { Fragment, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { SiteNavbar } from "../components/ui/SiteNavbar";
import { useLocalProgress } from "../../lib/storage/use-local-progress";

const historyPageSize = 3;

export default function Stats() {
  const progress = useLocalProgress();
  const [historyPage, setHistoryPage] = useState(1);
  const stats = progress.stats.classic;
  const distribution = Object.entries(stats.guessDistribution);
  const largestBucket = Math.max(1, ...distribution.map(([, value]) => value));
  const allHistory = Object.values(progress.games).sort((a, b) =>
    b.challengeDate.localeCompare(a.challengeDate),
  );
  const totalPages = Math.max(1, Math.ceil(allHistory.length / historyPageSize));
  const page = Math.min(historyPage, totalPages);
  const historyGames = allHistory.slice((page - 1) * historyPageSize, page * historyPageSize);

  return (
    <main className="page prose">
      <SiteNavbar />
      <p className="eyebrow">Your device record</p>
      <h1>Statistics</h1>
      <div className="stat-grid">
        <div>
          <strong>{stats.currentStreak}</strong>
          <span>Current streak</span>
        </div>
        <div>
          <strong>{stats.bestStreak}</strong>
          <span>Best streak</span>
        </div>
        <div>
          <strong>{stats.gamesPlayed}</strong>
          <span>Games solved</span>
        </div>
      </div>

      <section className="stats-section" aria-labelledby="distribution-title">
        <div className="stats-section__heading">
          <div>
            <p className="eyebrow">Solved games</p>
            <h2 id="distribution-title">Guess distribution</h2>
          </div>
          <span>{stats.gamesWon} wins</span>
        </div>
        <div className="distribution" aria-label="Win distribution by number of guesses">
          {distribution.map(([attempts, value]) => {
            const width = value ? Math.max(7, (value / largestBucket) * 100) : 0;
            const isHot = value > 0 && value === largestBucket;
            return (
              <div className="distribution__row" data-hot={isHot || undefined} key={attempts}>
                <span className="distribution__label">{attempts}</span>
                <div
                  aria-label={`${value} wins in ${attempts} guesses`}
                  aria-valuemax={largestBucket}
                  aria-valuemin={0}
                  aria-valuenow={value}
                  className="distribution__track"
                  role="progressbar"
                >
                  <i className="distribution__fill" style={{ width: `${width}%` }} />
                </div>
                <strong>{value}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="stats-section" aria-labelledby="history-title">
        <div className="stats-section__heading">
          <div>
            <p className="eyebrow">Stored on this device</p>
            <h2 id="history-title">Saved guesses</h2>
          </div>
          <span>{allHistory.length} games</span>
        </div>
        {historyGames.length ? (
          <>
            <ol className="guess-history">
              {historyGames.map((game) => (
                <li key={game.challengeId}>
                  <div className="guess-history__meta">
                    <strong>{game.challengeDate}</strong>
                    <span>
                      {game.status === "solved"
                        ? `Solved in ${game.guesses.length} guesses`
                        : `${game.guesses.length} guesses · in progress`}
                    </span>
                  </div>
                  <p className="guess-history__guesses">
                    {game.guesses.map((guess, index) => (
                      <Fragment key={guess.modelId}>
                        <span>{guess.modelName}</span>
                        {index < game.guesses.length - 1 && <FaChevronRight aria-hidden="true" />}
                      </Fragment>
                    ))}
                  </p>
                </li>
              ))}
            </ol>
            {totalPages > 1 && (
              <nav className="history-pagination" aria-label="Saved guesses pages">
                <button
                  className="history-pagination__button"
                  disabled={page === 1}
                  onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  <FaChevronLeft aria-hidden="true" /> Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="history-pagination__button"
                  disabled={page === totalPages}
                  onClick={() => setHistoryPage((current) => Math.min(totalPages, current + 1))}
                  type="button"
                >
                  Next <FaChevronRight aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        ) : (
          <p className="stats-empty">Play a game and your guesses will appear here.</p>
        )}
      </section>
    </main>
  );
}
