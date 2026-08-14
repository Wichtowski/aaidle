import {
  classicColumnsForGame,
  type ClassicComparison,
} from "../../../lib/domain/guesses/comparison-types";
import type {
  ClassicCategory,
  ClassicDifficulty,
  ComparableModel,
} from "../../../lib/domain/models/model-types";

type TrajectoryGuess = {
  attemptNumber: number;
  comparison: ClassicComparison;
  isCorrect: boolean;
  model: ComparableModel;
};

const scoreByStatus: Record<string, number> = {
  correct: 1,
  partial: 0.55,
  higher: 0.4,
  lower: 0.4,
  incorrect: 0,
};

function clueAlignment(
  guess: TrajectoryGuess,
  category: ClassicCategory,
  difficulty: ClassicDifficulty,
) {
  if (guess.isCorrect) return 100;

  const statuses = classicColumnsForGame(category, difficulty)
    .map((column) => guess.comparison[column])
    .filter((status) => status !== undefined && status !== "unknown");

  if (!statuses.length) return 0;

  return Math.round(
    (statuses.reduce((score, status) => score + (scoreByStatus[status] ?? 0), 0) /
      statuses.length) *
      100,
  );
}

export function CompletionTrajectory({
  category,
  difficulty,
  guesses,
}: {
  category: ClassicCategory;
  difficulty: ClassicDifficulty;
  guesses: TrajectoryGuess[];
}) {
  const width = 720;
  const height = 370;
  const plot = { left: 58, right: 28, top: 30, bottom: 58 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const points = guesses.map((guess, index) => {
    const alignment = clueAlignment(guess, category, difficulty);
    const x =
      guesses.length === 1
        ? plot.left + plotWidth / 2
        : plot.left + (plotWidth * index) / (guesses.length - 1);
    const y = plot.top + ((100 - alignment) / 100) * plotHeight;

    return { ...guess, alignment, x, y };
  });
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  const bestPriorAlignment = Math.max(0, ...points.filter((point) => !point.isCorrect).map((point) => point.alignment));
  const answer = guesses.find((guess) => guess.isCorrect)?.model;

  return (
    <section className="completed-trajectory" aria-labelledby="completed-trajectory-title">
      <div>
        <h3 id="completed-trajectory-title">Your guessing trajectory</h3>
        <p>Each point measures how closely that guess matched the answer’s revealed clues.</p>
      </div>
      <div className="completed-trajectory__metrics" aria-label="Trajectory summary">
        <span><strong>{bestPriorAlignment}%</strong> best match before winning</span>
        {answer && <span><strong>100%</strong> final answer: {answer.name}</span>}
      </div>
      <svg
        aria-label={`Your clue-alignment trajectory across ${guesses.length} guesses`}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="completion-trajectory-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect height={plotHeight} width={plotWidth} x={plot.left} y={plot.top} />
        {[0, 25, 50, 75, 100].map((value) => {
          const y = plot.top + ((100 - value) / 100) * plotHeight;
          return (
            <g className="completed-trajectory__grid" key={value}>
              <line x1={plot.left} x2={width - plot.right} y1={y} y2={y} />
              <text x={plot.left - 10} y={y + 4}>{value}%</text>
            </g>
          );
        })}
        {points.length > 1 && (
          <polygon
            className="completed-trajectory__area"
            points={`${plot.left},${plot.top + plotHeight} ${path} ${width - plot.right},${plot.top + plotHeight}`}
          />
        )}
        {points.length > 1 && <polyline className="completed-trajectory__path" points={path} />}
        {points.map((point) => (
          <g
            className={`completed-trajectory__point${point.isCorrect ? " completed-trajectory__point--answer" : ""}`}
            key={point.attemptNumber}
            transform={`translate(${point.x} ${point.y})`}
          >
            <title>
              {point.isCorrect
                ? `Winning guess: ${point.model.name}, 100% clue alignment`
                : `Guess ${point.attemptNumber}: ${point.model.name}, ${point.alignment}% clue alignment`}
            </title>
            <circle r={point.isCorrect ? 10 : 7} />
            {point.isCorrect ? (
              <path
                aria-hidden="true"
                className="completed-trajectory__star"
                d="M0 -5.4 1.6 -1.8 5.5 -1.7 2.4 .7 3.3 4.7 0 2.7 -3.3 4.7 -2.4 .7 -5.5 -1.7 -1.6 -1.8Z"
              />
            ) : (
              <text alignmentBaseline="central" dominantBaseline="central" textAnchor="middle">
                {point.attemptNumber}
              </text>
            )}
            <text className="completed-trajectory__point-label" textAnchor="middle" y="-15">
              {point.alignment}%
            </text>
          </g>
        ))}
        {points.map((point) => (
          <text className="completed-trajectory__attempt-label" key={point.attemptNumber} textAnchor="middle" x={point.x} y={height - 25}>
            {point.isCorrect ? "Win" : `Guess ${point.attemptNumber}`}
          </text>
        ))}
        <text className="completed-trajectory__axis-label" x={width / 2} textAnchor="middle" y={height - 7}>Your attempts</text>
        <text className="completed-trajectory__axis-label" transform="rotate(-90 15 185)" x="15" textAnchor="middle" y="185">Clue alignment</text>
      </svg>
      <div className="completed-trajectory__legend">
        <span><i data-kind="guess" /> Your guesses</span>
        <span><i data-kind="answer" /> Winning guess</span>
      </div>
    </section>
  );
}
