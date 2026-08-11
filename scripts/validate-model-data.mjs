import { readFileSync } from "node:fs";
const data = JSON.parse(readFileSync(new URL("../data/models.seed.json", import.meta.url)));
const ids = new Set(),
  names = new Set();
for (const model of data) {
  if (ids.has(model.id) || names.has(model.name)) throw new Error(`Duplicate model: ${model.id}`);
  ids.add(model.id);
  names.add(model.name);
  if (
    !model.provider ||
    !model.country ||
    !model.family ||
    !/^\d{4}-\d{2}-\d{2}$/.test(model.releaseDate ?? "") ||
    !Number.isInteger(model.contextWindowTokens) ||
    model.contextWindowTokens <= 0
  )
    throw new Error(`Invalid core data: ${model.id}`);
  if (!model.categories.length || !model.inputModalities.length || !model.outputModalities.length)
    throw new Error(`Incomplete playable model: ${model.id}`);
  if (new Set(model.aliases.map((a) => a.toLowerCase())).size !== model.aliases.length)
    throw new Error(`Duplicate aliases: ${model.id}`);
}
if (data.length < 30) throw new Error("At least 30 models are required");
console.log(`Validated ${data.length} models.`);
