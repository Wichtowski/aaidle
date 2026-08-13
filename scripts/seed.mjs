import { readFileSync } from "node:fs";
import "./validate-model-data.mjs";
import { sqliteConnection } from "./sqlite-connection.mjs";

const models = JSON.parse(readFileSync(new URL("../data/models.seed.json", import.meta.url)));
const countryCode = {
  "United States": "US",
  Canada: "CA",
  China: "CN",
  France: "FR",
  Poland: "PL",
};
const unknownProvider = "Unknown";
const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const now = Date.now();
const database = sqliteConnection();

const upsertProvider = database.prepare(`
  INSERT INTO providers (id, name, slug, country_code, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    country_code = excluded.country_code,
    updated_at = excluded.updated_at
`);
const insertFamily = database.prepare(`
  INSERT INTO model_families (id, provider_id, name, slug, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING
`);
const upsertModel = database.prepare(`
  INSERT INTO models (
    id, provider_id, family_id, name, slug, release_date, release_year, context_window_tokens,
    open_weights, local_execution, reasoning_support, status, is_guessable, verified_at,
    source_label, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, '2026-08-11', 'Official model documentation', ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    provider_id = excluded.provider_id,
    family_id = excluded.family_id,
    name = excluded.name,
    release_date = excluded.release_date,
    release_year = excluded.release_year,
    context_window_tokens = excluded.context_window_tokens,
    open_weights = excluded.open_weights,
    local_execution = excluded.local_execution,
    reasoning_support = excluded.reasoning_support,
    updated_at = excluded.updated_at
`);
const insertAlias = database.prepare(`
  INSERT INTO model_aliases (id, model_id, alias, normalized_alias)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(model_id, normalized_alias) DO NOTHING
`);
const insertDictionary = {
  categories: database.prepare(
    "INSERT INTO categories (id, name, slug) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
  ),
  modalities: database.prepare(
    "INSERT INTO modalities (id, name, slug) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
  ),
  use_cases: database.prepare(
    "INSERT INTO use_cases (id, name, slug) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
  ),
};
const insertLink = {
  model_categories: database.prepare(
    "INSERT INTO model_categories (model_id, category_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
  ),
  model_input_modalities: database.prepare(
    "INSERT INTO model_input_modalities (model_id, modality_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
  ),
  model_output_modalities: database.prepare(
    "INSERT INTO model_output_modalities (model_id, modality_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
  ),
  model_use_cases: database.prepare(
    "INSERT INTO model_use_cases (model_id, use_case_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
  ),
};

const seed = database.transaction(() => {
  for (const model of models) {
    const providerName = model.provider ?? unknownProvider;
    const providerId = slug(providerName);
    const familyId = model.family ? `${providerId}-${slug(model.family)}` : null;
    const releaseYear = model.releaseDate ? Number(model.releaseDate.slice(0, 4)) : null;

    upsertProvider.run(
      providerId,
      providerName,
      providerId,
      countryCode[model.country] ?? "UN",
      now,
      now,
    );
    if (familyId) {
      insertFamily.run(familyId, providerId, model.family, slug(model.family), now, now);
    }
    upsertModel.run(
      model.id,
      providerId,
      familyId,
      model.name,
      model.id,
      model.releaseDate ?? null,
      releaseYear,
      model.contextWindowTokens,
      model.weightAvailability === "open" ? 1 : 0,
      "unknown",
      model.reasoningSupport ?? "unknown",
      now,
      now,
    );

    for (const alias of model.aliases ?? [])
      insertAlias.run(`${model.id}-${slug(alias)}`, model.id, alias, slug(alias));

    for (const [table, values, link] of [
      ["categories", model.categories, "model_categories"],
      ["modalities", model.inputModalities ?? [], "model_input_modalities"],
      ["modalities", model.outputModalities ?? [], "model_output_modalities"],
      ["use_cases", model.useCases ?? [], "model_use_cases"],
    ]) {
      for (const value of values) {
        const id = slug(value);
        insertDictionary[table].run(id, value.replaceAll("-", " "), id);
        insertLink[link].run(model.id, id);
      }
    }
  }
});

try {
  seed();
  console.log(`Seeded ${models.length} models.`);
} finally {
  database.close();
}
