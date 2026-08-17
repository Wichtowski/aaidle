import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertModelArray,
  categoryFile,
  CLASSIC_CATEGORIES,
  readJson,
  writeJson,
} from "./classic-seed-constants.mjs";

const input = resolve(process.argv[2] ?? "data/classic.seed.json");
const outputDirectory = resolve(process.argv[3] ?? "data/classic");

if (!existsSync(input)) throw new Error(`Input file does not exist: ${input}`);

const models = readJson(input, { readFileSync });

assertModelArray(models, input);
mkdirSync(outputDirectory, { recursive: true });

const modelsByCategory = new Map(CLASSIC_CATEGORIES.map((category) => [category, []]));

for (const model of models) {
  const details = model.categoryDetails ?? {};
  for (const category of Object.keys(details)) {
    if (!modelsByCategory.has(category))
      throw new Error(`Unsupported categoryDetails key "${category}" in ${model.id}.`);
    modelsByCategory
      .get(category)
      .push({ ...model, categoryDetails: { [category]: details[category] } });
  }
}

for (const [category, categoryModels] of modelsByCategory) {
  writeJson(`${outputDirectory}/${categoryFile(category)}`, categoryModels, { writeFileSync });
}

console.log(`Split ${models.length} models from ${input} into ${modelsByCategory.size} files.`);
