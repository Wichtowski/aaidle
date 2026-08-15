import { useState, type PointerEvent } from "react";
import {
  classicCategoryDetails,
  classicCategoryFromRouteSegment,
  type ComparableModel,
} from "@/lib/domain/models/model-types";
import { modelSpaceAxes, modelSpacePoint } from "@/lib/domain/models/model-space";
import { localProgressSchema } from "@/lib/storage/local-progress-schema";
import { distribution } from "@/lib/utils/dates";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatMode(mode: string) {
  const [game, categorySegment, difficulty] = mode.split(":");
  const category = classicCategoryFromRouteSegment(categorySegment);

  if (game !== "classic" || !category || !difficulty) return mode;

  return `${classicCategoryDetails[category].label} · ${difficulty}`;
}

function gameModeName(mode: string) {
  const [game] = mode.split(":");
  return game ? `${game.slice(0, 1).toUpperCase()}${game.slice(1)}` : "Unknown";
}

function formatTimestamp(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "Unknown time" : dateTime.format(timestamp);
}

type Point3 = { x: number; y: number; z: number };

function asComparableModel(value: unknown): ComparableModel | null {
  if (!value || typeof value !== "object") return null;
  const model = value as Partial<ComparableModel>;
  return typeof model.id === "string" && typeof model.name === "string"
    ? (model as ComparableModel)
    : null;
}

function project(point: Point3, azimuth: number, elevation: number) {
  const cosAzimuth = Math.cos(azimuth);
  const sinAzimuth = Math.sin(azimuth);
  const cosElevation = Math.cos(elevation);
  const sinElevation = Math.sin(elevation);
  const rotatedX = point.x * cosAzimuth - point.z * sinAzimuth;
  const rotatedZ = point.x * sinAzimuth + point.z * cosAzimuth;
  const rotatedY = point.y * cosElevation - rotatedZ * sinElevation;

  return {
    x: 360 + rotatedX * 238,
    y: 248 - rotatedY * 186,
    depth: point.y * sinElevation + rotatedZ * cosElevation,
  };
}

const cubeCorners: Point3[] = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
];

const cubeEdges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

function gridLines() {
  const lines: Array<[Point3, Point3]> = [];
  for (const coordinate of [-1, -0.5, 0, 0.5, 1]) {
    lines.push(
      [
        { x: -1, y: coordinate, z: -1 },
        { x: 1, y: coordinate, z: -1 },
      ],
      [
        { x: coordinate, y: -1, z: -1 },
        { x: coordinate, y: 1, z: -1 },
      ],
      [
        { x: -1, y: -1, z: coordinate },
        { x: 1, y: -1, z: coordinate },
      ],
    );
  }
  return lines;
}

function GuessTrajectory({
  game,
  target,
  referenceModels,
}: {
  game: { mode: string; guesses: Array<{ attemptNumber: number; model: unknown }> };
  target: ComparableModel;
  referenceModels: ComparableModel[];
}) {
  const [rotation, setRotation] = useState({ azimuth: -0.65, elevation: 0.35 });
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    rotation: typeof rotation;
  } | null>(null);
  const [, categorySegment] = game.mode.split(":");
  const category = classicCategoryFromRouteSegment(categorySegment) ?? "hardcore";
  const axes = modelSpaceAxes(category);
  const guesses = game.guesses
    .map((guess) => ({ ...guess, model: asComparableModel(guess.model) }))
    .filter((guess): guess is { attemptNumber: number; model: ComparableModel } =>
      Boolean(guess.model),
    )
    .sort((left, right) => left.attemptNumber - right.attemptNumber);
  const points = [
    ...guesses.map((guess) => ({
      id: guess.model.id,
      label: guess.model.name,
      kind: "guess" as const,
      number: guess.attemptNumber,
      point: modelSpacePoint(guess.model, category, referenceModels),
    })),
    {
      id: target.id,
      label: target.name,
      kind: "answer" as const,
      point: modelSpacePoint(target, category, referenceModels),
    },
  ];
  const projectedPoints = points.map((item) => ({
    ...item,
    projected: project(item.point, rotation.azimuth, rotation.elevation),
  }));
  const linePoints = projectedPoints.filter((item) => item.kind === "guess");
  const answer = projectedPoints.find((item) => item.kind === "answer");
  const trajectoryModelIds = new Set(points.map((item) => item.id));
  const references = referenceModels
    .filter((model) => !trajectoryModelIds.has(model.id))
    .map((model) => ({
      model,
      projected: project(
        modelSpacePoint(model, category, referenceModels),
        rotation.azimuth,
        rotation.elevation,
      ),
    }))
    .sort((left, right) => left.projected.depth - right.projected.depth);
  const projectedCorners = cubeCorners.map((corner) =>
    project(corner, rotation.azimuth, rotation.elevation),
  );
  const drag = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragStart) return;
    setRotation({
      azimuth: dragStart.rotation.azimuth + (event.clientX - dragStart.x) / 120,
      elevation: Math.max(
        -1.1,
        Math.min(1.1, dragStart.rotation.elevation + (event.clientY - dragStart.y) / 160),
      ),
    });
  };

  return (
    <section className="admin-progress__section" aria-labelledby="admin-progress-trajectory-title">
      <div className="admin-progress__heading">
        <div>
          <h4 id="admin-progress-trajectory-title">Latest solved-game trajectory</h4>
          <p>Drag to rotate · {axes.map((axis) => axis.label.toLocaleLowerCase()).join(", ")}</p>
        </div>
        <span>
          {guesses.length} guesses · {references.length} references
        </span>
      </div>
      <svg
        aria-label={`Three-dimensional guess trajectory toward ${target.name}`}
        className="admin-trajectory"
        onPointerCancel={() => setDragStart(null)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragStart({ x: event.clientX, y: event.clientY, rotation });
        }}
        onPointerMove={drag}
        onPointerUp={() => setDragStart(null)}
        role="img"
        viewBox="0 0 720 500"
      >
        <rect height="472" width="688" x="16" y="14" />
        <g className="admin-trajectory__grid">
          {gridLines().map(([start, end], index) => {
            const projectedStart = project(start, rotation.azimuth, rotation.elevation);
            const projectedEnd = project(end, rotation.azimuth, rotation.elevation);
            return (
              <line
                key={index}
                x1={projectedStart.x}
                x2={projectedEnd.x}
                y1={projectedStart.y}
                y2={projectedEnd.y}
              />
            );
          })}
        </g>
        <g className="admin-trajectory__cube">
          {cubeEdges.map(([start, end]) => (
            <line
              key={`${start}:${end}`}
              x1={projectedCorners[start].x}
              x2={projectedCorners[end].x}
              y1={projectedCorners[start].y}
              y2={projectedCorners[end].y}
            />
          ))}
        </g>
        <g className="admin-trajectory__references">
          {references.map(({ model, projected }) => (
            <circle cx={projected.x} cy={projected.y} key={model.id} r="3">
              <title>{model.name}</title>
            </circle>
          ))}
        </g>
        {linePoints.length > 1 && (
          <polyline
            className="admin-trajectory__path"
            points={linePoints.map((item) => `${item.projected.x},${item.projected.y}`).join(" ")}
          />
        )}
        {linePoints.at(-1) && answer && (
          <line
            className="admin-trajectory__destination"
            x1={linePoints.at(-1)?.projected.x}
            x2={answer.projected.x}
            y1={linePoints.at(-1)?.projected.y}
            y2={answer.projected.y}
          />
        )}
        {projectedPoints
          .sort((left, right) => left.projected.depth - right.projected.depth)
          .map((item) => (
            <g
              className={`admin-trajectory__point admin-trajectory__point--${item.kind}`}
              key={`${item.kind}:${item.label}`}
              transform={`translate(${item.projected.x} ${item.projected.y})`}
            >
              <title>
                {item.kind === "answer"
                  ? `Answer: ${item.label}`
                  : `Guess ${item.number}: ${item.label}`}
              </title>
              <circle r={item.kind === "answer" ? 8 : 6} />
              <text dy="4" textAnchor="middle">
                {item.kind === "answer" ? "★" : item.number}
              </text>
            </g>
          ))}
        <text className="admin-trajectory__axis-label" x="658" y="474">
          {axes[0].label}
        </text>
        <text
          className="admin-trajectory__axis-label"
          transform="rotate(-90 33 105)"
          x="33"
          y="105"
        >
          {axes[1].label}
        </text>
        <text className="admin-trajectory__axis-label" x="590" y="33">
          {axes[2].label}
        </text>
      </svg>
      <div className="admin-trajectory__legend">
        <span>
          <i data-kind="guess" />
          Guess path
        </span>
        <span>
          <i data-kind="answer" />
          Answer · {target.name}
        </span>
        <span>
          <i data-kind="reference" />
          Candidate model
        </span>
      </div>
    </section>
  );
}

export function AdminProgressRecord({
  progress,
  trajectoryTargets,
  trajectoryReferenceModels,
  onRemoveGuess,
  removingGuessId,
}: {
  progress: unknown;
  trajectoryTargets: Record<string, ComparableModel>;
  trajectoryReferenceModels: ComparableModel[];
  onRemoveGuess?: (gameKey: string, requestId: string) => void;
  removingGuessId?: string | null;
}) {
  const [recentGamesPage, setRecentGamesPage] = useState(1);
  const [selectedGameMode, setSelectedGameMode] = useState<string | null>(null);
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(null);
  const parsedProgress = localProgressSchema.safeParse(progress);

  if (!parsedProgress.success) {
    return (
      <p className="admin-empty">
        This synced progress record cannot be displayed because it does not match the current game
        data format.
      </p>
    );
  }

  const games = Object.entries(parsedProgress.data.games)
    .map(([gameKey, game]) => ({ ...game, gameKey }))
    .sort(
      (left, right) =>
        right.challengeDate.localeCompare(left.challengeDate) ||
        right.startedAt.localeCompare(left.startedAt),
    );
  const solvedGames = games.filter((game) => game.status === "solved");
  const inProgressGames = games.filter((game) => game.status === "in-progress");
  const totalGuesses = games.reduce((total, game) => total + game.guesses.length, 0);
  const solvedGuessCount = solvedGames.reduce((total, game) => total + game.guesses.length, 0);
  const averageGuesses = solvedGames.length ? solvedGuessCount / solvedGames.length : 0;
  const guessDistribution = distribution();

  for (const game of solvedGames) {
    const bucket = game.guesses.length > 9 ? "10+" : String(game.guesses.length);
    guessDistribution[bucket] = (guessDistribution[bucket] ?? 0) + 1;
  }

  const distributionValues = Object.entries(guessDistribution);
  const largestBucket = Math.max(1, ...distributionValues.map(([, value]) => value));
  const enabledPreferences = [
    parsedProgress.data.preferences.hardcoreUnlocked && "Hardcore unlocked",
    parsedProgress.data.preferences.hellMode && "Hell mode",
    parsedProgress.data.preferences.highContrast && "High contrast",
    parsedProgress.data.preferences.reducedMotion && "Reduced motion",
  ].filter((value): value is string => Boolean(value));
  const latestSolvedGame = solvedGames.find((game) => trajectoryTargets[game.challengeId]);
  const gameModes = [...new Set(games.map((game) => game.mode.split(":")[0]))];
  const activeGameMode = gameModes.includes(selectedGameMode ?? "")
    ? selectedGameMode!
    : (gameModes[0] ?? null);
  const gamesForMode = games.filter((game) => game.mode.split(":")[0] === activeGameMode);
  const recentGamesPageSize = 5;
  const recentGamesTotalPages = Math.max(1, Math.ceil(gamesForMode.length / recentGamesPageSize));
  const visibleRecentGamesPage = Math.min(recentGamesPage, recentGamesTotalPages);
  const visibleGames = gamesForMode.slice(
    (visibleRecentGamesPage - 1) * recentGamesPageSize,
    visibleRecentGamesPage * recentGamesPageSize,
  );
  const selectedGame =
    visibleGames.find((game) => game.gameKey === selectedGameKey) ?? visibleGames[0] ?? null;

  return (
    <div className="admin-progress">
      <dl className="admin-progress__summary">
        <div>
          <dt>Solved</dt>
          <dd>{solvedGames.length}</dd>
        </div>
        <div>
          <dt>In progress</dt>
          <dd>{inProgressGames.length}</dd>
        </div>
        <div>
          <dt>Total guesses</dt>
          <dd>{totalGuesses}</dd>
        </div>
        <div>
          <dt>Average to solve</dt>
          <dd>{solvedGames.length ? averageGuesses.toFixed(1) : "-"}</dd>
        </div>
        <div>
          <dt>Current streak</dt>
          <dd>{parsedProgress.data.stats.classic.currentStreak}</dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd>{parsedProgress.data.stats.classic.bestStreak}</dd>
        </div>
      </dl>

      <div className="admin-progress__preferences">
        <span>Preferences</span>
        {enabledPreferences.length ? (
          enabledPreferences.map((preference) => <strong key={preference}>{preference}</strong>)
        ) : (
          <em>Default settings</em>
        )}
      </div>

      <section
        className="admin-progress__section"
        aria-labelledby="admin-progress-distribution-title"
      >
        <h4 id="admin-progress-distribution-title">Solved-game distribution</h4>
        <div
          className="admin-progress__distribution"
          aria-label="Solved games by number of guesses"
        >
          {distributionValues.map(([attempts, value]) => {
            const width = value ? Math.max(7, (value / largestBucket) * 100) : 0;
            return (
              <div key={attempts}>
                <span>{attempts}</span>
                <div
                  aria-label={`${value} solved games in ${attempts} guesses`}
                  aria-valuemax={largestBucket}
                  aria-valuemin={0}
                  aria-valuenow={value}
                  role="progressbar"
                >
                  <i style={{ width: `${width}%` }} />
                </div>
                <strong>{value}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="admin-progress__section" aria-labelledby="admin-progress-games-title">
        <div className="admin-progress__heading">
          <h4 id="admin-progress-games-title">Recent saved games</h4>
          <span>{games.length} total</span>
        </div>
        {games.length ? (
          <>
            <div aria-label="Game modes" className="admin-progress__game-tabs" role="tablist">
              {gameModes.map((mode) => (
                <button
                  aria-controls="admin-game-dates"
                  aria-selected={activeGameMode === mode}
                  id={`admin-game-tab-${mode}`}
                  key={mode}
                  onClick={() => {
                    setSelectedGameMode(mode);
                    setSelectedGameKey(null);
                    setRecentGamesPage(1);
                  }}
                  role="tab"
                  type="button"
                >
                  <strong>{gameModeName(mode)}</strong>
                  <span>
                    {games.filter((game) => game.mode.split(":")[0] === mode).length} saved
                  </span>
                </button>
              ))}
            </div>
            {selectedGame && (
              <section
                aria-labelledby={`admin-game-tab-${activeGameMode}`}
                className="admin-progress__game-detail"
                id="admin-game-dates"
                role="tabpanel"
              >
                <div className="admin-progress__date-tabs" aria-label="Saved dates">
                  {visibleGames.map((game) => (
                    <button
                      aria-current={game.gameKey === selectedGame.gameKey ? "page" : undefined}
                      key={game.gameKey}
                      onClick={() => setSelectedGameKey(game.gameKey)}
                      type="button"
                    >
                      {game.challengeDate}
                    </button>
                  ))}
                </div>
                <div>
                  <strong data-status={selectedGame.status}>
                    {selectedGame.status === "solved" ? "Solved" : "In progress"}
                  </strong>
                  <span>
                    {selectedGame.guesses.length} guesses · Started{" "}
                    {formatTimestamp(selectedGame.startedAt)}
                  </span>
                </div>
                {selectedGame.guesses.length ? (
                  <ol className="admin-progress__guess-list">
                    {selectedGame.guesses.map((guess) => (
                      <li key={guess.requestId}>
                        <span>
                          {guess.attemptNumber}. {guess.modelName}
                        </span>
                        {onRemoveGuess && (
                          <button
                            className="button button--danger-solid"
                            disabled={removingGuessId === guess.requestId}
                            onClick={() => onRemoveGuess(selectedGame.gameKey, guess.requestId)}
                            type="button"
                          >
                            {removingGuessId === guess.requestId ? "Removing..." : "Remove guess"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="admin-empty">No saved guesses for this game.</p>
                )}
              </section>
            )}
          </>
        ) : (
          <p className="admin-empty">No games have been saved in this progress record.</p>
        )}
        {recentGamesTotalPages > 1 && (
          <div className="admin-pagination admin-pagination--compact">
            <button
              className="button"
              disabled={visibleRecentGamesPage === 1}
              onClick={() => setRecentGamesPage(visibleRecentGamesPage - 1)}
              type="button"
            >
              Previous
            </button>
            <span>
              Page {visibleRecentGamesPage} of {recentGamesTotalPages}
            </span>
            <button
              className="button"
              disabled={visibleRecentGamesPage === recentGamesTotalPages}
              onClick={() => setRecentGamesPage(visibleRecentGamesPage + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        )}
      </section>
      {latestSolvedGame && (
        <GuessTrajectory
          game={latestSolvedGame}
          referenceModels={trajectoryReferenceModels}
          target={trajectoryTargets[latestSolvedGame.challengeId]}
        />
      )}
    </div>
  );
}
