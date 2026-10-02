import type { ClassicColumn } from "./comparison-types";

export const formatScalar = (value: string | number | boolean | null | undefined) =>
  value == null ? "N/A" : typeof value === "boolean" ? (value ? "Yes" : "No") : value;

export const formatContextWindow = (tokens: number | null) => {
  if (tokens === null) return "N/A";
  if (tokens <= 10_000 || tokens % 100 !== 0) return String(tokens);

  return `${tokens / 1_000}K`;
};

// A revealed hint reads exactly like the matching cell on the guess board
export function formatHintValue(
  column: ClassicColumn,
  value: string | number | boolean | string[] | null,
): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "N/A";
  if (column === "contextWindowTokens") {
    return formatContextWindow(typeof value === "number" ? value : null);
  }
  return String(formatScalar(value));
}
