import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { SiteNavbar } from "../components/ui/SiteNavbar";
import { ActivationPrompt } from "../components/auth/ActivationPrompt";
import { ProfileDangerZone } from "../components/auth/ProfileDangerZone";
import { useAuth } from "../components/auth/useAuth";
import { useLocalProgress } from "../../lib/storage/use-local-progress";
import {
  classicCategories,
  classicCategoryDetails,
  classicChallengeMode,
  focusedClassicCategories,
  type ClassicCategory,
} from "../../lib/domain/models/model-types";
import { distribution } from "../../lib/utils/dates";
import {
  hasCompletedChallengeRitual,
  solvedChallengeCategoriesForDate,
} from "../../lib/domain/games/classic/hardcore-unlock";
import { updateProgress } from "../../lib/storage/local-progress-store";
import { apiClient, type ProgressHistory } from "../../lib/api/client";
import { mergeServerProgress } from "../../lib/domain/players/cloud-progress";

const historyPageSize = 3;
const ritualHints = [
  "Complete focused Challenge boards to see whether the ledger starts watching back.",
  "Something is not right. One seal has warmed. Complete the remaining Challenges today.",
  "Two seals are open. The ledger has begun to remember your name. Keep going.",
  "Three seals have shifted. Do not stop now. Three Challenges remain.",
  "Four seals are broken. Two Challenges remain.",
  "Five seals are broken. One Challenge remains.",
] as const;

type RitualContentProps = {
  hellAwake: boolean;
  ritualCategories: readonly ClassicCategory[];
  ritualComplete: boolean;
  onEnterInnerCircle: () => void;
};

function RitualContent({
  hellAwake,
  ritualCategories,
  ritualComplete,
  onEnterInnerCircle,
}: RitualContentProps) {
  return (
    <>
      <div
        className="hell-meter__steps"
        aria-label={`${ritualCategories.length} of ${focusedClassicCategories.length} Challenge categories solved today`}
      >
        {classicCategories
          .filter((item) => item !== "hardcore")
          .map((item) => {
            const complete = ritualCategories.includes(item);
            return (
              <span className={complete ? "is-complete" : undefined} key={item}>
                {complete ? "✦" : "○"} {classicCategoryDetails[item].label}
              </span>
            );
          })}
      </div>
      <p>
        {hellAwake
          ? "All six seals are broken. The ledger has opened a path below the catalogue."
          : ritualComplete
            ? "The inner circle remembers your name."
            : ritualHints[ritualCategories.length]}
      </p>
      {hellAwake && (
        <button className="button button--inner-circle" onClick={onEnterInnerCircle} type="button">
          Enter the inner circle
        </button>
      )}
    </>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { hardcoreUnlocked, refreshHardcoreAccess, user } = useAuth();
  const progress = useLocalProgress();
  const today = new Date().toISOString().slice(0, 10);
  const ritualCategories = solvedChallengeCategoriesForDate(progress, today);
  const ritualComplete = hasCompletedChallengeRitual(progress, today);
  const hasCompletedHardcore = Object.values(progress.games).some(
    (game) =>
      game.mode === classicChallengeMode("hardcore", "hardcore") && game.status === "solved",
  );
  const canSeeInnerCircle = Boolean(user);
  const showRitualChallenge = canSeeInnerCircle && !hasCompletedHardcore;
  const hellAwake = canSeeInnerCircle && ritualComplete && !hardcoreUnlocked;
  const hellModeEnabled = canSeeInnerCircle && hardcoreUnlocked && progress.preferences.hellMode;
  const hellActive = hellAwake || hellModeEnabled;
  const [historyPage, setHistoryPage] = useState(1);
  const [category, setCategory] = useState<ClassicCategory>("llm");
  const [cloudHistory, setCloudHistory] = useState<ProgressHistory | null>(null);

  useEffect(() => {
    if (!user) {
      setCloudHistory(null);
      return;
    }
    let cancelled = false;
    setCloudHistory(null);
    void apiClient
      .progressHistory(category, historyPage)
      .then((history) => {
        if (!cancelled) setCloudHistory(history);
      })
      .catch(() => {
        if (!cancelled) setCloudHistory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [category, historyPage, user]);

  const allHistory = Object.values(progress.games).sort((a, b) =>
    b.challengeDate.localeCompare(a.challengeDate),
  );
  const categoryModePrefix = classicChallengeMode(category, "normal").replace(/normal$/, "");
  const localCategoryHistory = allHistory.filter((game) =>
    game.mode.startsWith(categoryModePrefix),
  );
  const solved = localCategoryHistory.filter((game) => game.status === "solved");
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
    if (
      index === 0 ||
      new Date(`${dates[index - 1]}T00:00:00Z`).getTime() -
        new Date(`${dates[index]}T00:00:00Z`).getTime() ===
        86_400_000
    ) {
      runningStreak += 1;
    } else runningStreak = 1;
    if (index === 0) currentStreak = runningStreak;
    else if (currentStreak === index) currentStreak = runningStreak;
    bestStreak = Math.max(bestStreak, runningStreak);
  }
  const localStats = {
    currentStreak,
    bestStreak,
    gamesPlayed: solved.length,
    gamesWon: solved.length,
    guessDistribution,
  };
  const stats = user && cloudHistory ? cloudHistory.stats : localStats;
  const distributionValues = Object.entries(stats.guessDistribution);
  const largestBucket = Math.max(1, ...distributionValues.map(([, value]) => value));
  const totalWins = distributionValues.reduce((total, [, value]) => total + value, 0);
  const historyCount = user ? (cloudHistory?.total ?? 0) : localCategoryHistory.length;
  const totalPages = Math.max(1, Math.ceil(historyCount / historyPageSize));
  const page = Math.min(historyPage, totalPages);
  const historyGames = user
    ? (cloudHistory?.games ?? []).map((game) => ({
        challengeId: game.challengeId,
        challengeDate: game.challengeDate,
        mode: game.mode,
        status: game.status,
        guesses: game.guessedModelNames.map((modelName, index) => ({
          modelId: `${game.challengeId}:${index}`,
          modelName,
        })),
      }))
    : localCategoryHistory.slice((page - 1) * historyPageSize, page * historyPageSize);
  const enterInnerCircle = () => {
    if (!user) {
      navigate("/login");
      return;
    }

    const nextProgress = {
      ...progress,
      preferences: {
        ...progress.preferences,
        hardcoreUnlocked: true,
        innerCircleActive: true,
      },
    };

    void apiClient
      .enableHardcoreAccess()
      .then(() => apiClient.syncProgress(nextProgress))
      .then(({ progress: syncedProgress }) => {
        updateProgress(() => mergeServerProgress(syncedProgress, nextProgress));
        return refreshHardcoreAccess();
      })
      .then(() => navigate("/classic/hardcore"));
  };
  const toggleHellMode = () => {
    const hellMode = !progress.preferences.hellMode;
    const nextProgress = {
      ...progress,
      preferences: { ...progress.preferences, hellMode },
    };
    window.localStorage.setItem("aaidle:hell-mode:v1", hellMode ? "1" : "0");
    document.cookie = [
      `aaidle_hell_mode=${hellMode ? "1" : "0"}`,
      "Path=/",
      "Max-Age=31536000",
      "SameSite=Lax",
    ].join("; ");
    window.dispatchEvent(new Event("aaidle:hell-mode-change"));
    updateProgress(() => nextProgress);
  };

  useEffect(() => {
    document.body.classList.toggle("profile-hell", hellActive);
    return () => document.body.classList.remove("profile-hell");
  }, [hellActive]);

  return (
    <main className={`page prose profile-page${hellActive ? " profile-page--hell" : ""}`}>
      <SiteNavbar hardcore={hellActive} />
      <p className="eyebrow">{hellActive ? "The ledger has noticed you" : "Your device record"}</p>
      <h1 data-testid="profile-heading">{hellActive ? "The infernal" : "Profile"}</h1>
      {user && !user.emailVerified && <ActivationPrompt email={user.email} />}
      {showRitualChallenge && !ritualComplete && (
        <section className="hell-meter" aria-labelledby="hell-meter-title">
          <div className="stats-section__heading">
            <div>
              <p className="eyebrow">Challenge ritual · {today}</p>
              <h2 id="hell-meter-title">
                {hellActive ? "Something is brewing" : "A quiet disturbance"}
              </h2>
            </div>
            <span>
              {ritualCategories.length}/{focusedClassicCategories.length}
            </span>
          </div>
          <RitualContent
            hellAwake={hellAwake}
            onEnterInnerCircle={enterInnerCircle}
            ritualCategories={ritualCategories}
            ritualComplete={ritualComplete}
          />
        </section>
      )}
      {showRitualChallenge && ritualComplete && !hardcoreUnlocked && (
        <details className="hell-meter hell-meter--complete" open>
          <summary>
            <span>
              <span className="eyebrow">Challenge ritual · {today}</span>
              <strong>Something is brewing</strong>
            </span>
            <span>
              {ritualCategories.length}/{focusedClassicCategories.length}
            </span>
          </summary>
          <div className="hell-meter__content">
            <RitualContent
              hellAwake={hellAwake}
              onEnterInnerCircle={enterInnerCircle}
              ritualCategories={ritualCategories}
              ritualComplete={ritualComplete}
            />
          </div>
        </details>
      )}
      <div className="classic-category-nav" role="tablist" aria-label="Classic category statistics">
        {classicCategories
          .filter((item) => item !== "hardcore" || Boolean(user && hardcoreUnlocked))
          .map((item) => (
            <button
              aria-selected={category === item}
              onClick={() => {
                setCategory(item);
                setHistoryPage(1);
              }}
              role="tab"
              type="button"
              key={item}
            >
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
            const width = totalWins ? (value / totalWins) * 100 : 0;
            const isHot = value > 0 && value === largestBucket;
            return (
              <div className="distribution__row" data-hot={isHot || undefined} key={attempts}>
                <span className="distribution__label">{attempts}</span>
                <div
                  aria-label={`${value} wins in ${attempts} guesses`}
                  aria-valuemax={totalWins}
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
            <p className="eyebrow">{user ? "Stored on your account" : "Stored on this device"}</p>
            <h2 id="history-title">Saved guesses</h2>
          </div>
          <span>{historyCount} games</span>
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
      {showRitualChallenge && ritualComplete && hardcoreUnlocked && (
        <details className="hell-meter hell-meter--complete">
          <summary>
            <span>
              <span className="eyebrow">Challenge ritual · {today}</span>
              <strong>The six seals are broken</strong>
            </span>
            <span>
              {ritualCategories.length}/{focusedClassicCategories.length}
            </span>
          </summary>
          <div className="hell-meter__content">
            <RitualContent
              hellAwake={hellAwake}
              onEnterInnerCircle={enterInnerCircle}
              ritualCategories={ritualCategories}
              ritualComplete={ritualComplete}
            />
          </div>
        </details>
      )}
      {canSeeInnerCircle && hardcoreUnlocked && (
        <section className="hell-mode-control" aria-labelledby="hell-mode-title">
          <div className="hell-mode-control__copy">
            <p className="eyebrow">Inner circle</p>
            <h2 id="hell-mode-title">Use hell mode everywhere</h2>
            <p>
              {hellModeEnabled
                ? "The ledger is following you through every page."
                : "Let the ledger follow you through every page."}
            </p>
          </div>
          <label className="hell-mode-toggle">
            <span className="sr-only">Use hell mode everywhere</span>
            <input checked={hellModeEnabled} onChange={toggleHellMode} type="checkbox" />
            <span aria-hidden="true" className="hell-mode-toggle__control" />
          </label>
        </section>
      )}
      <ProfileDangerZone />
    </main>
  );
}
