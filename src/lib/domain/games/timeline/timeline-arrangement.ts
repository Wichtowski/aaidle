import type { TimelineGamePayload } from "./timeline-types";

export const TIMELINE_DESKTOP_COLUMNS = 6;

export function timelineVisualPosition(
  position: number,
  columns: number,
): { row: number; column: number } | null {
  if (columns <= 0 || position < 0) return null;

  const row = Math.floor(position / columns);
  const positionWithinRow = position % columns;
  const column = row % 2 === 0 ? positionWithinRow : columns - positionWithinRow - 1;
  return { row: row + 1, column: column + 1 };
}

export function initialTimelinePositions(game: TimelineGamePayload): Array<string | null> {
  return game.slots.map((slot) => slot.anchor?.id ?? null);
}

export function restoreTimelinePositions(
  game: TimelineGamePayload,
  candidate: Array<string | null>,
): Array<string | null> | null {
  if (candidate.length !== game.slots.length) return null;
  const modelIds = new Set([
    ...game.movableModels.map((model) => model.id),
    ...game.slots.flatMap((slot) => (slot.anchor ? [slot.anchor.id] : [])),
  ]);
  const occupied = candidate.filter((modelId): modelId is string => modelId !== null);
  if (new Set(occupied).size !== occupied.length || occupied.some((id) => !modelIds.has(id))) {
    return null;
  }
  if (game.slots.some((slot) => slot.anchor && candidate[slot.position] !== slot.anchor.id)) {
    return null;
  }
  return [...candidate];
}

export function moveTimelineModel(
  positions: Array<string | null>,
  anchorPositions: ReadonlySet<number>,
  modelId: string,
  targetPosition: number | null,
): Array<string | null> {
  const sourcePosition = positions.indexOf(modelId);
  if (sourcePosition >= 0 && anchorPositions.has(sourcePosition)) return positions;
  if (targetPosition !== null && anchorPositions.has(targetPosition)) return positions;
  if (sourcePosition === targetPosition) return positions;

  const next = [...positions];
  if (targetPosition === null) {
    if (sourcePosition < 0) return positions;
    next[sourcePosition] = null;
    return next;
  }

  const displaced = next[targetPosition] ?? null;
  next[targetPosition] = modelId;
  if (sourcePosition >= 0) next[sourcePosition] = displaced;
  return next;
}

export function timelineArrangementIsComplete(
  positions: Array<string | null>,
  expectedModelIds: ReadonlySet<string>,
) {
  if (positions.length !== expectedModelIds.size || positions.some((position) => !position)) {
    return false;
  }
  return (
    new Set(positions as string[]).size === expectedModelIds.size &&
    positions.every((modelId) => modelId !== null && expectedModelIds.has(modelId))
  );
}

export function adjacentMovablePosition(
  currentPosition: number,
  direction: -1 | 1,
  total: number,
  anchorPositions: ReadonlySet<number>,
) {
  for (
    let position = currentPosition + direction;
    position >= 0 && position < total;
    position += direction
  ) {
    if (!anchorPositions.has(position)) return position;
  }
  return currentPosition;
}
