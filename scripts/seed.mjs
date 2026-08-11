import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./validate-model-data.mjs";

const models = JSON.parse(readFileSync(new URL("../data/models.seed.json", import.meta.url)));
const countryCode = {
  "United States": "US",
  Canada: "CA",
  China: "CN",
  France: "FR",
  Poland: "PL",
};
const esc = (value) => `'${String(value).replaceAll("'", "''")}'`;
const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const now = Date.now();
let sql = "PRAGMA foreign_keys=ON;\n";
for (const model of models) {
  const providerId = slug(model.provider),
    familyId = `${providerId}-${slug(model.family)}`,
    date = model.releaseDate,
    releaseYear = Number(date.slice(0, 4));
  sql += `INSERT INTO providers (id,name,slug,country_code,is_active,created_at,updated_at) VALUES (${esc(providerId)},${esc(model.provider)},${esc(providerId)},${esc(countryCode[model.country] ?? "UN")},1,${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,country_code=excluded.country_code,updated_at=excluded.updated_at;\n`;
  sql += `INSERT INTO model_families (id,provider_id,name,slug,created_at,updated_at) VALUES (${esc(familyId)},${esc(providerId)},${esc(model.family)},${esc(slug(model.family))},${now},${now}) ON CONFLICT(id) DO NOTHING;\n`;
  sql += `INSERT INTO models (id,provider_id,family_id,name,slug,release_date,release_year,context_window_tokens,open_weights,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES (${esc(model.id)},${esc(providerId)},${esc(familyId)},${esc(model.name)},${esc(model.id)},${esc(date)},${releaseYear},${model.contextWindowTokens},${model.openWeights ? 1 : 0},${esc(model.localExecution)},${esc(model.reasoningSupport)},'active',1,'2026-08-11','Official model documentation',${now},${now}) ON CONFLICT(id) DO UPDATE SET release_date=excluded.release_date,release_year=excluded.release_year,context_window_tokens=excluded.context_window_tokens,open_weights=excluded.open_weights,local_execution=excluded.local_execution,reasoning_support=excluded.reasoning_support,updated_at=excluded.updated_at;\n`;
  for (const alias of model.aliases)
    sql += `INSERT INTO model_aliases (id,model_id,alias,normalized_alias) VALUES (${esc(`${model.id}-${slug(alias)}`)},${esc(model.id)},${esc(alias)},${esc(slug(alias))}) ON CONFLICT(model_id,normalized_alias) DO NOTHING;\n`;
  for (const [table, values, link, column] of [
    ["categories", model.categories, "model_categories", "category_id"],
    ["modalities", model.inputModalities, "model_input_modalities", "modality_id"],
    ["modalities", model.outputModalities, "model_output_modalities", "modality_id"],
    ["use_cases", model.useCases, "model_use_cases", "use_case_id"],
  ])
    for (const value of values) {
      const id = slug(value);
      sql += `INSERT INTO ${table} (id,name,slug) VALUES (${esc(id)},${esc(value.replaceAll("-", " "))},${esc(id)}) ON CONFLICT(id) DO NOTHING;\nINSERT INTO ${link} (model_id,${column}) VALUES (${esc(model.id)},${esc(id)}) ON CONFLICT DO NOTHING;\n`;
    }
}
const file = join(tmpdir(), "aidle-seed.sql");
writeFileSync(file, sql);
try {
  execFileSync(
    "pnpm",
    [
      "wrangler",
      "d1",
      "execute",
      "aidle-db",
      ...(process.argv.includes("--remote") ? ["--remote"] : ["--local"]),
      "--file",
      file,
    ],
    { stdio: "inherit" },
  );
} finally {
  rmSync(file, { force: true });
}
