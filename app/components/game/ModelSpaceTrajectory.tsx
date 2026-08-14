"use client";

import { useState, type PointerEvent } from "react";
import { modelSpaceAxes, modelSpacePoint } from "../../../lib/domain/models/model-space";
import type {
  ClassicCategory,
  ComparableModel,
} from "../../../lib/domain/models/model-types";

type Point3 = { x: number; y: number; z: number };

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
  [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7],
] as const;

function gridLines() {
  const lines: Array<[Point3, Point3]> = [];
  for (const coordinate of [-1, -0.5, 0, 0.5, 1]) {
    lines.push(
      [{ x: -1, y: coordinate, z: -1 }, { x: 1, y: coordinate, z: -1 }],
      [{ x: coordinate, y: -1, z: -1 }, { x: coordinate, y: 1, z: -1 }],
      [{ x: -1, y: -1, z: coordinate }, { x: 1, y: -1, z: coordinate }],
    );
  }
  return lines;
}

function project(point: Point3, azimuth: number, elevation: number) {
  const rotatedX = point.x * Math.cos(azimuth) - point.z * Math.sin(azimuth);
  const rotatedZ = point.x * Math.sin(azimuth) + point.z * Math.cos(azimuth);
  const rotatedY = point.y * Math.cos(elevation) - rotatedZ * Math.sin(elevation);

  return {
    x: 360 + rotatedX * 238,
    y: 248 - rotatedY * 186,
    depth: point.y * Math.sin(elevation) + rotatedZ * Math.cos(elevation),
  };
}

export function ModelSpaceTrajectory({
  category,
  guesses,
  referenceModels,
}: {
  category: ClassicCategory;
  guesses: Array<{ attemptNumber: number; isCorrect: boolean; model: ComparableModel }>;
  referenceModels: ComparableModel[];
}) {
  const [rotation, setRotation] = useState({ azimuth: -0.65, elevation: 0.35 });
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    rotation: typeof rotation;
  } | null>(null);
  const axes = modelSpaceAxes(category);
  const answer = guesses.find((guess) => guess.isCorrect);
  const pathGuesses = guesses.filter((guess) => !guess.isCorrect);
  const points = [
    ...pathGuesses.map((guess) => ({ ...guess, kind: "guess" as const })),
    ...(answer ? [{ ...answer, kind: "answer" as const }] : []),
  ].map((point) => ({
    ...point,
    projected: project(modelSpacePoint(point.model, category, referenceModels), rotation.azimuth, rotation.elevation),
  }));
  const pathPoints = points.filter((point) => point.kind === "guess");
  const answerPoint = points.find((point) => point.kind === "answer");
  const trajectoryModelIds = new Set(points.map((point) => point.model.id));
  const references = referenceModels
    .filter((model) => !trajectoryModelIds.has(model.id))
    .map((model) => ({
      model,
      projected: project(modelSpacePoint(model, category, referenceModels), rotation.azimuth, rotation.elevation),
    }))
    .sort((left, right) => left.projected.depth - right.projected.depth);
  const projectedCorners = cubeCorners.map((corner) => project(corner, rotation.azimuth, rotation.elevation));
  const drag = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragStart) return;
    setRotation({
      azimuth: dragStart.rotation.azimuth + (event.clientX - dragStart.x) / 120,
      elevation: Math.max(-1.1, Math.min(1.1, dragStart.rotation.elevation + (event.clientY - dragStart.y) / 160)),
    });
  };

  return (
    <section className="completed-model-space" aria-labelledby="completed-model-space-title">
      <div>
        <h3 id="completed-model-space-title">Latest solved-game trajectory</h3>
        <p>Drag to rotate. Nearby candidate models are more alike across these three category-specific measures.</p>
      </div>
      <svg
        aria-label={`Three-dimensional model-space trajectory toward ${answer?.model.name ?? "the answer"}`}
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
        <g className="completed-model-space__grid">
          {gridLines().map(([start, end], index) => {
            const projectedStart = project(start, rotation.azimuth, rotation.elevation);
            const projectedEnd = project(end, rotation.azimuth, rotation.elevation);
            return <line key={index} x1={projectedStart.x} x2={projectedEnd.x} y1={projectedStart.y} y2={projectedEnd.y} />;
          })}
        </g>
        <g className="completed-model-space__cube">
          {cubeEdges.map(([start, end]) => (
            <line key={`${start}:${end}`} x1={projectedCorners[start].x} x2={projectedCorners[end].x} y1={projectedCorners[start].y} y2={projectedCorners[end].y} />
          ))}
        </g>
        <g className="completed-model-space__references">
          {references.map(({ model, projected }) => (
            <circle cx={projected.x} cy={projected.y} key={model.id} r="3"><title>{model.name}</title></circle>
          ))}
        </g>
        {pathPoints.length > 1 && <polyline className="completed-model-space__path" points={pathPoints.map((point) => `${point.projected.x},${point.projected.y}`).join(" ")} />}
        {pathPoints.at(-1) && answerPoint && <line className="completed-model-space__destination" x1={pathPoints.at(-1)?.projected.x} x2={answerPoint.projected.x} y1={pathPoints.at(-1)?.projected.y} y2={answerPoint.projected.y} />}
        {points.sort((left, right) => left.projected.depth - right.projected.depth).map((point) => (
          <g className={`completed-model-space__point completed-model-space__point--${point.kind}`} key={`${point.kind}:${point.model.id}`} transform={`translate(${point.projected.x} ${point.projected.y})`}>
            <title>{point.kind === "answer" ? `Winning answer: ${point.model.name}` : `Guess ${point.attemptNumber}: ${point.model.name}`}</title>
            <circle r={point.kind === "answer" ? 8 : 6} />
            {point.kind === "answer" ? (
              <path
                aria-hidden="true"
                className="completed-model-space__star"
                d="M0 -5.4 1.6 -1.8 5.5 -1.7 2.4 .7 3.3 4.7 0 2.7 -3.3 4.7 -2.4 .7 -5.5 -1.7 -1.6 -1.8Z"
              />
            ) : (
              <text alignmentBaseline="central" dominantBaseline="central" textAnchor="middle">{point.attemptNumber}</text>
            )}
          </g>
        ))}
        <text className="completed-model-space__axis-label" x="658" y="474">{axes[0].label}</text>
        <text className="completed-model-space__axis-label" transform="rotate(-90 33 105)" x="33" y="105">{axes[1].label}</text>
        <text className="completed-model-space__axis-label" x="590" y="33">{axes[2].label}</text>
      </svg>
      <div className="completed-model-space__legend">
        <span><i data-kind="guess" /> Guess path</span>
        {answer && <span><i data-kind="answer" /> Answer · {answer.model.name}</span>}
        <span><i data-kind="reference" /> {references.length} candidate models</span>
      </div>
    </section>
  );
}
