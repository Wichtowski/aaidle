export const CLASSIC_CATEGORIES = [
  "classical-ml",
  "computer-vision",
  "filters",
  "language-model",
  "nlp",
  "object-detection",
];

export function categoryFile(category) {
  return `classic.${category}.seed.json`;
}

export function readJson(path, fs) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function assertModelArray(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must contain a JSON array of models.`);
  for (const [index, model] of value.entries()) {
    if (
      !model ||
      typeof model !== "object" ||
      Array.isArray(model) ||
      typeof model.id !== "string"
    ) {
      throw new Error(`${path} contains an invalid model at index ${index}.`);
    }
  }
}

export function writeJson(path, value, fs) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
