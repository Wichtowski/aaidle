import { Fragment, useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { SiteNavbar } from "@components/ui/SiteNavbar";
import { ActivationPrompt } from "@components/auth/ActivationPrompt";
import { ProfileDangerZone } from "@components/auth/ProfileDangerZone";
import { UsernameForm } from "@components/auth/UsernameForm";
import { DistributionChart } from "@components/ui/DistributionChart";
import { PageEyebrow } from "@components/ui/PageEyebrow";
import { useAuth } from "@components/auth/useAuth";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import {
  classicCategories,
  classicCategoryDetails,
  classicChallengeMode,
  focusedClassicCategories,
  type ClassicCategory,
} from "@lib/domain/models/model-types";
import { difficulties, type Difficulty } from "@lib/domain/difficulty";
import { distribution } from "@lib/utils/dates";
import {
  hasCompletedChallengeRitual,
  solvedChallengeCategoriesForDate,
} from "@lib/domain/games/classic/hardcore-unlock";
import { calculateSolvedStreaks } from "@lib/domain/players/streak-service";
import { updateProgress } from "@lib/storage/local-progress-store";
import { apiClient, type ProgressHistory } from "@lib/api/client";
import { readSavedTimelineGames } from "@lib/domain/games/timeline/timeline-progress-store";
import {
  timelineDifficulties,
  type TimelineDifficulty,
} from "@lib/domain/games/timeline/timeline-types";

const historyPageSize = 3;
type StatsGame = "classic" | "emoji" | "timeline";
type ProfileDifficulty = Difficulty | TimelineDifficulty;
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

export function ProfilePage() {
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
  const showRitualChallenge = canSeeInnerCircle && !hardcoreUnlocked && !hasCompletedHardcore;
  const hellAwake = canSeeInnerCircle && ritualComplete && !hardcoreUnlocked;
  const hellModeEnabled = canSeeInnerCircle && hardcoreUnlocked && progress.preferences.hellMode;
  const hellActive = hellAwake || hellModeEnabled;
  const [historyPage, setHistoryPage] = useState(1);
  const [statsGame, setStatsGame] = useState<StatsGame>("classic");
  const [category, setCategory] = useState<ClassicCategory>("llm");
  const [difficulty, setDifficulty] = useState<ProfileDifficulty>("normal");
  const [cloudHistory, setCloudHistory] = useState<ProgressHistory | null>(null);
  const activeCategory = statsGame === "classic" ? category : difficulty;
  const attemptTerm = statsGame === "timeline" ? "submissions" : "guesses";
  const attemptTermSingular = statsGame === "timeline" ? "submission" : "guess";

  useEffect(() => {
    if (!user) {
      setCloudHistory(null);
      return;
    }
    let cancelled = false;
    setCloudHistory(null);
    void apiClient
      .progressHistory(statsGame, activeCategory, historyPage)
      .then((history) => {
        if (!cancelled) setCloudHistory(history);
      })
      .catch(() => {
        if (!cancelled) setCloudHistory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory, historyPage, statsGame, user]);

  const allHistory = Object.values(progress.games).sort((a, b) =>
    b.challengeDate.localeCompare(a.challengeDate),
  );
  const categoryModePrefix = classicChallengeMode(category, "normal").replace(/normal$/, "");
  const localClassicHistory = allHistory.filter((game) => game.mode.startsWith(categoryModePrefix));
  const localTimelineHistory = readSavedTimelineGames()
    .filter((game) => game.difficulty === difficulty && (game.acceptedAttempts > 0 || game.solved))
    .sort((left, right) => right.challengeDate.localeCompare(left.challengeDate));
  const localHistory =
    statsGame === "classic"
      ? localClassicHistory.map((game) => ({
          challengeId: game.challengeId,
          challengeDate: game.challengeDate,
          mode: game.mode,
          status: game.status,
          attemptCount: game.guesses.length,
          labels: game.guesses.map((guess) => guess.modelName),
        }))
      : statsGame === "timeline"
        ? localTimelineHistory.map((game) => ({
            challengeId: game.challengeId,
            challengeDate: game.challengeDate,
            mode: `timeline:${game.difficulty}`,
            status: game.solved ? ("solved" as const) : ("in-progress" as const),
            attemptCount: game.acceptedAttempts,
            labels: Array.from(
              { length: game.acceptedAttempts },
              (_, index) => `Submission ${index + 1}`,
            ),
          }))
        : [];
  const solved = localHistory.filter((game) => game.status === "solved");
  const guessDistribution = distribution();
  for (const game of solved) {
    const bucket = game.attemptCount > 8 ? "8+" : String(game.attemptCount);
    guessDistribution[bucket] = (guessDistribution[bucket] ?? 0) + 1;
  }
  const { currentStreak, bestStreak } = calculateSolvedStreaks(
    solved.map((game) => game.challengeDate),
  );
  const localStats = {
    currentStreak,
    bestStreak,
    gamesPlayed: solved.length,
    gamesWon: solved.length,
    guessDistribution,
  };
  const stats = user && cloudHistory ? cloudHistory.stats : localStats;
  const distributionBuckets = ["1", "2", "3", "4", "5", "6", "7", "8+"];
  const historyCount = user ? (cloudHistory?.total ?? 0) : localHistory.length;
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
    : localHistory.slice((page - 1) * historyPageSize, page * historyPageSize).map((game) => ({
        challengeId: game.challengeId,
        challengeDate: game.challengeDate,
        mode: game.mode,
        status: game.status,
        guesses: game.labels.map((modelName, index) => ({
          modelId: `${game.challengeId}:${index}`,
          modelName,
        })),
      }));
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
      .then(() => {
        updateProgress(() => nextProgress);
        return refreshHardcoreAccess();
      })
      .then(() => navigate("/classic/hardcore"));
  };
  const setHellMode = (hellMode: boolean) => {
    const nextProgress = {
      ...progress,
      preferences: { ...progress.preferences, hellMode },
    };
    updateProgress(() => nextProgress);
  };

  const toggleHellMode = () => setHellMode(!progress.preferences.hellMode);

  useLayoutEffect(() => {
    document.body.classList.toggle("profile-hell", hellActive);
    return () => document.body.classList.remove("profile-hell");
  }, [hellActive]);

  return (
    <main className={`page prose profile-page${hellActive ? " profile-page--hell" : ""}`}>
      <SiteNavbar hardcore={hellActive} />
      <PageEyebrow>{hellActive ? "The ledger has noticed you" : "Your device record"}</PageEyebrow>
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
      <div className="profile-game-tabs" role="tablist" aria-label="Game statistics">
        {(["classic", "emoji", "timeline"] as const).map((game) => (
          <button
            aria-selected={statsGame === game}
            key={game}
            onClick={() => {
              setStatsGame(game);
              if (game === "emoji" && !difficulties.includes(difficulty as Difficulty)) {
                setDifficulty("normal");
              }
              setHistoryPage(1);
            }}
            role="tab"
            type="button"
          >
            {game === "classic" ? "Classic" : game === "emoji" ? "Emoji" : "Timeline"}
          </button>
        ))}
      </div>
      <div
        className={`classic-category-nav${statsGame === "classic" && category === "hardcore" ? " classic-category-nav--hardcore" : ""}`}
        role="tablist"
        aria-label={`${statsGame === "classic" ? "Classic category" : "Difficulty"} statistics`}
      >
        {statsGame === "classic"
          ? classicCategories
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
              ))
          : (statsGame === "emoji" ? difficulties : timelineDifficulties)
              .filter((item) => item !== "hardcore" || Boolean(user && hardcoreUnlocked))
              .map((item) => (
                <button
                  aria-selected={difficulty === item}
                  onClick={() => {
                    setDifficulty(item);
                    setHistoryPage(1);
                  }}
                  role="tab"
                  type="button"
                  key={item}
                >
                  {item[0]!.toUpperCase() + item.slice(1)}
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
            <h2 id="distribution-title">
              {statsGame === "timeline" ? "Submission distribution" : "Guess distribution"}
            </h2>
          </div>
          <span>{stats.gamesWon} wins</span>
        </div>
        <DistributionChart
          attemptTerm={attemptTerm}
          attemptTermSingular={attemptTermSingular}
          buckets={distributionBuckets}
          distribution={stats.guessDistribution}
        />
      </section>

      {user && <UsernameForm />}

      <section className="stats-section" aria-labelledby="history-title">
        <div className="stats-section__heading">
          <div>
            <p className="eyebrow">{user ? "Stored on your account" : "Stored on this device"}</p>
            <h2 id="history-title">
              {statsGame === "timeline" ? "Submissions by day" : "Saved guesses"}
            </h2>
          </div>
          <span>
            {historyCount} {statsGame === "timeline" ? "days" : "games"}
          </span>
        </div>
        {historyGames.length ? (
          <>
            <ol className="guess-history">
              {historyGames.map((game) => (
                <li key={game.challengeId}>
                  <div className="guess-history__meta">
                    <strong>{game.challengeDate}</strong>
                    {statsGame === "timeline" ? (
                      <span>
                        {game.guesses.length}{" "}
                        {game.guesses.length === 1 ? "submission" : "submissions"}
                      </span>
                    ) : (
                      <span>
                        {game.status === "solved"
                          ? `Solved in ${game.guesses.length} ${game.guesses.length === 1 ? attemptTermSingular : attemptTerm}`
                          : `${game.guesses.length} ${game.guesses.length === 1 ? attemptTermSingular : attemptTerm} · in progress`}
                      </span>
                    )}
                  </div>
                  {statsGame !== "timeline" && (
                    <p className="guess-history__guesses">
                      {game.guesses.map((guess, index) => (
                        <Fragment key={guess.modelId}>
                          <span>{guess.modelName}</span>
                          {index < game.guesses.length - 1 && <FaChevronRight aria-hidden="true" />}
                        </Fragment>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            {totalPages > 1 && (
              <nav className="history-pagination" aria-label={`Saved ${attemptTerm} pages`}>
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
          <p className="stats-empty">Play a game and your {attemptTerm} will appear here.</p>
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
