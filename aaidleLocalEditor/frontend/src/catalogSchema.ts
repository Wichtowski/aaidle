import type { JsonObject, JsonValue } from "./JsonFormEditor";

export type CatalogGame = "classic" | "emoji" | "logo" | "timeline";

// These editor-only descriptions intentionally do not import or duplicate browser game types.
// They describe which values the seed validators require to be present and non-empty.
type RequiredRule = { path: string; message: string; nullable?: boolean };

const rules: Record<CatalogGame, RequiredRule[]> = {
  classic: [
    "id",
    "name",
    "modelClass",
    "entityType",
    "minPool",
    "provider",
    "family",
    "aliases",
    "categories",
    "inputModalities",
    "outputModalities",
    "useCases",
    "weightAvailability",
    "country",
    "releaseDate",
    "categoryDetails",
  ].map((path) => ({
    path,
    message: `${path} is required`,
    nullable: ["provider", "country", "releaseDate"].includes(path),
  })),
  emoji: ["id", "name", "entityKind", "minPool", "categories", "variants"].map((path) => ({
    path,
    message: `${path} is required`,
  })),
  logo: [
    "answerId",
    "minPool",
    "visualType",
    "assetName",
    "assetUrl",
    "revealProfile",
    "clues",
  ].map((path) => ({
    path,
    message: `${path} is required`,
    nullable: path === "revealProfile",
  })),
  timeline: ["id", "kind", "name", "minPool", "categories", "releaseDate"].map((path) => ({
    path,
    message: `${path} is required`,
  })),
};

function isEmpty(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function requiredPaths(game: string): string[] {
  return game in rules ? rules[game as CatalogGame].map((rule) => rule.path) : [];
}

export function validateRequiredFields(game: string, item: JsonObject): Record<string, string> {
  if (!(game in rules)) return {};
  return Object.fromEntries(
    rules[game as CatalogGame]
      .filter(
        (rule) => !Object.hasOwn(item, rule.path) || (!rule.nullable && isEmpty(item[rule.path])),
      )
      .map((rule) => [rule.path, rule.message]),
  );
}
