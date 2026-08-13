"use client";

import { useState, type PointerEvent } from "react";
import type { ComparableModel } from "../../../lib/domain/models/model-types";

type Point3 = { x: number; y: number; z: number };

function modelPoint(model: ComparableModel): Point3 {
  const releaseYear = model.releaseYear ?? 2020;
  const context = model.contextWindowTokens
    ? Math.log10(Math.max(1, model.contextWindowTokens))
    : 3;
  const capabilityCount = [
    model.categories?.length ?? 0,
    model.inputModalities?.length ?? 0,
    model.outputModalities?.length ?? 0,
    model.useCases?.length ?? 0,
    model.reasoningSupport === "native" ? 1 : 0,
    model.weightAvailability === "open" ? 1 : 0,
  ].reduce((total, value) => total + value, 0);

  return {
    x: Math.max(-1, Math.min(1, (releaseYear - 2012) / 14)),
    y: Math.max(-1, Math.min(1, (context - 4.5) / 2.5)),
    z: Math.max(-1, Math.min(1, (capabilityCount - 4) / 6)),
  };
}

function project(point: Point3, azimuth: number, elevation: number) {
  const rotatedX = point.x * Math.cos(azimuth) - point.z * Math.sin(azimuth);
  const rotatedZ = point.x * Math.sin(azimuth) + point.z * Math.cos(azimuth);
  const rotatedY = point.y * Math.cos(elevation) - rotatedZ * Math.sin(elevation);

  return {
    x: 240 + rotatedX * 150,
    y: 160 - rotatedY * 116,
    depth: point.y * Math.sin(elevation) + rotatedZ * Math.cos(elevation),
  };
}

export function CompletionTrajectory({
  guesses,
  answer,
}: {
  guesses: Array<{ attemptNumber: number; model: ComparableModel }>;
  answer: ComparableModel;
}) {
  const [rotation, setRotation] = useState({ azimuth: -0.65, elevation: 0.35 });
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    rotation: typeof rotation;
  } | null>(null);
  const pathGuesses = guesses.filter((guess) => guess.model.id !== answer.id);
  const points = [
    ...pathGuesses.map((guess) => ({
      label: guess.model.name,
      kind: "guess" as const,
      number: guess.attemptNumber,
      point: modelPoint(guess.model),
    })),
    { label: answer.name, kind: "answer" as const, point: modelPoint(answer) },
  ];
  const projectedPoints = points.map((point) => ({
    ...point,
    projected: project(point.point, rotation.azimuth, rotation.elevation),
  }));
  const linePoints = projectedPoints.filter((point) => point.kind === "guess");
  const answerPoint = projectedPoints.find((point) => point.kind === "answer");
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
    <section className="completed-trajectory" aria-labelledby="completed-trajectory-title">
      <div>
        <h3 id="completed-trajectory-title">Your trajectory</h3>
        <p>Drag to rotate · release year, context scale, capability breadth</p>
      </div>
      <svg
        aria-label={`Three-dimensional guess trajectory toward ${answer.name}`}
        onPointerCancel={() => setDragStart(null)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragStart({ x: event.clientX, y: event.clientY, rotation });
        }}
        onPointerMove={drag}
        onPointerUp={() => setDragStart(null)}
        role="img"
        viewBox="0 0 480 320"
      >
        <rect height="292" width="452" x="14" y="14" />
        {[64, 112, 160, 208, 256].map((coordinate) => (
          <g className="completed-trajectory__grid" key={coordinate}>
            <line x1="24" x2="456" y1={coordinate} y2={coordinate} />
            <line x1={coordinate + 16} x2={coordinate + 16} y1="24" y2="296" />
          </g>
        ))}
        {linePoints.length > 1 && (
          <polyline
            className="completed-trajectory__path"
            points={linePoints.map((point) => `${point.projected.x},${point.projected.y}`).join(" ")}
          />
        )}
        {linePoints.at(-1) && answerPoint && (
          <line
            className="completed-trajectory__destination"
            x1={linePoints.at(-1)?.projected.x}
            x2={answerPoint.projected.x}
            y1={linePoints.at(-1)?.projected.y}
            y2={answerPoint.projected.y}
          />
        )}
        {projectedPoints
          .sort((left, right) => left.projected.depth - right.projected.depth)
          .map((point) => (
            <g
              className={`completed-trajectory__point completed-trajectory__point--${point.kind}`}
              key={`${point.kind}:${point.label}`}
              transform={`translate(${point.projected.x} ${point.projected.y})`}
            >
              <title>
                {point.kind === "answer"
                  ? `Answer: ${point.label}`
                  : `Guess ${point.number}: ${point.label}`}
              </title>
              <circle r={point.kind === "answer" ? 8 : 6} />
              <text dy="4" textAnchor="middle">
                {point.kind === "answer" ? "★" : point.number}
              </text>
            </g>
          ))}
        <text className="completed-trajectory__axis-label" x="380" y="292">Release year</text>
        <text className="completed-trajectory__axis-label" transform="rotate(-90 30 116)" x="30" y="116">Context scale</text>
        <text className="completed-trajectory__axis-label" x="330" y="34">Capability breadth</text>
      </svg>
      <div className="completed-trajectory__legend">
        <span><i data-kind="guess" /> Guess path</span>
        <span><i data-kind="answer" /> Answer · {answer.name}</span>
      </div>
    </section>
  );
}
