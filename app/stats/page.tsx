"use client";

import { Fragment, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { SiteNavbar } from "../components/ui/SiteNavbar";
import { useLocalProgress } from "../../lib/storage/use-local-progress";
import { classicCategories, classicCategoryDetails, type ClassicCategory } from "../../lib/domain/models/model-types";
import { distribution } from "../../lib/utils/dates";
import {
  hasCompletedChallengeRitual,
  solvedChallengeCategoriesForDate,
} from "../../lib/domain/games/classic/hardcore-unlock";

const historyPageSize = 3;
const ritualHints = [
  "Complete focused Challenge boards to see whether the ledger starts watching back.",
  "Something is not right. One seal has warmed. Complete the remaining Challenges today.",
  "Two seals are open. The ledger has begun to remember your name. Keep going.",
  "Three seals have shifted. Do not stop now; two Challenges remain.",
  "Four seals are broken. One more Challenge today should reveal what is underneath.",
] as const;

export default function Stats() {
  const progress = useLocalProgress();
  const today = new Date().toISOString().slice(0, 10);
  const ritualCategories = solvedChallengeCategoriesForDate(progress, today);
  const ritualComplete = hasCompletedChallengeRitual(progress, today);
  const hellAwake = ritualComplete && !progress.preferences.hardcoreUnlocked;
  const [historyPage, setHistoryPage] = useState(1);
  const [category, setCategory] = useState<ClassicCategory>("llm");
  const allHistory = Object.values(progress.games).sort((a, b) =>
    b.challengeDate.localeCompare(a.challengeDate),
  );
  const categoryHistory = allHistory.filter((game) => game.mode.startsWith(`classic:${category}:`));
  const solved = categoryHistory.filter((game) => game.status === "solved");
  const guessDistribution = distribution();
  for (const game of solved) {
    const bucket = game.guesses.length > 9 ? "10+" : String(game.guesses.length);
    guessDistribution[bucket] = (guessDistribution[bucket] ?? 0) + 1;
  }
  const dates = [...new Set(solved.map((game) => game.challengeDate))].sort().reverse();
  let currentStreak = 0;
  let bestStreak = 0;
  let runningStreak = 0;
  for (let index = 0; index < dates.length; index += 1) {
    if (index === 0 || new Date(`${dates[index - 1]}T00:00:00Z`).getTime() - new Date(`${dates[index]}T00:00:00Z`).getTime() === 86_400_000) runningStreak += 1;
    else runningStreak = 1;
    if (index === 0) currentStreak = runningStreak;
    else if (currentStreak === index) currentStreak = runningStreak;
    bestStreak = Math.max(bestStreak, runningStreak);
  }
  const stats = { currentStreak, bestStreak, gamesPlayed: solved.length, gamesWon: solved.length, guessDistribution };
  const distributionValues = Object.entries(stats.guessDistribution);
  const largestBucket = Math.max(1, ...distributionValues.map(([, value]) => value));
  const totalPages = Math.max(1, Math.ceil(categoryHistory.length / historyPageSize));
  const page = Math.min(historyPage, totalPages);
  const historyGames = categoryHistory.slice((page - 1) * historyPageSize, page * historyPageSize);

  return (
    <main className={`page prose stats-page${hellAwake ? " stats-page--hell" : ""}`}>
      <SiteNavbar hardcore={hellAwake} />
      <p className="eyebrow">{hellAwake ? "The ledger has noticed you" : "Your device record"}</p>
      <h1>{hellAwake ? "The infernal ledger" : "Statistics"}</h1>
      <section className="hell-meter" aria-labelledby="hell-meter-title">
        <div className="stats-section__heading">
          <div>
            <p className="eyebrow">Challenge ritual · {today}</p>
            <h2 id="hell-meter-title">{hellAwake ? "Something is brewing" : "A quiet disturbance"}</h2>
          </div>
          <span>{ritualCategories.length}/{hellAwake ? 6 : 5}</span>
        </div>
        <div className="hell-meter__steps" aria-label={`${ritualCategories.length} of 5 Challenge categories solved today`}>
          {classicCategories.filter((item) => item !== "hardcore").map((item) => {
            const complete = ritualCategories.includes(item);
            return <span className={complete ? "is-complete" : undefined} key={item}>{complete ? "✦" : "○"} {classicCategoryDetails[item].label}</span>;
          })}
          {hellAwake && <span className="hell-meter__final">☠ 666</span>}
        </div>
        <p>
          {hellAwake
            ? "Five seals are broken. Return to the familiar catalogue and offer the number the ledger has been waiting for."
            : ritualHints[ritualCategories.length]}
        </p>
      </section>
      <div className="classic-category-nav" role="tablist" aria-label="Classic category statistics">
        {classicCategories
          .filter((item) => item !== "hardcore" || progress.preferences.hardcoreUnlocked)
          .map((item) => (
          <button aria-selected={category === item} onClick={() => { setCategory(item); setHistoryPage(1); }} role="tab" type="button" key={item}>
            {classicCategoryDetails[item].label}
          </button>
          ))}
      </div>
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
          {distributionValues.map(([attempts, value]) => {
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
          <span>{categoryHistory.length} games</span>
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
