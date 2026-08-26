import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertModelArray,
  categoryFile,
  CLASSIC_CATEGORIES,
  readJson,
  writeJson,
} from "./classic-seed-constants.mjs";
import { syncTimelineSeed } from "./timeline-seed-constants.mjs";

const inputDirectory = resolve(process.argv[2] ?? "data/classic");
const output = resolve(process.argv[3] ?? "data/classic.seed.json");
const baselinePath = process.argv[4] ? resolve(process.argv[4]) : output;
const modelsById = new Map();

if (existsSync(baselinePath)) {
  const baseline = readJson(baselinePath, { readFileSync });
  assertModelArray(baseline, baselinePath);
  for (const model of baseline) modelsById.set(model.id, model);
}

for (const category of CLASSIC_CATEGORIES) {
  const path = `${inputDirectory}/${categoryFile(category)}`;
  if (!existsSync(path)) throw new Error(`Missing category file: ${path}`);
  const categoryModels = readJson(path, { readFileSync });
  assertModelArray(categoryModels, path);
  for (const model of categoryModels) {
    const existing = modelsById.get(model.id);
    const existingDetails = existing?.categoryDetails ?? {};
    const incomingDetails = model.categoryDetails ?? {};
    const unexpected = Object.keys(incomingDetails).filter((key) => key !== category);
    if (unexpected.length > 0)
      throw new Error(
        `${path} contains ${model.id} with categoryDetails outside "${category}": ${unexpected.join(", ")}.`,
      );
    modelsById.set(model.id, {
      ...(existing ?? {}),
      ...model,
      categoryDetails: { ...existingDetails, ...incomingDetails },
    });
  }
}

const models = [...modelsById.values()];
writeJson(output, models, { writeFileSync });
syncTimelineSeed({ classicPath: output });
console.log(`Merged ${models.length} models into ${output}.`);
