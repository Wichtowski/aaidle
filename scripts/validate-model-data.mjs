import { readFileSync } from "node:fs";

const data = JSON.parse(
  readFileSync(new URL("../data/models.seed.json", import.meta.url), "utf8"),
);

const MODEL_CLASSES = new Set([
  "decoder_llm",
  "encoder_decoder",
  "encoder",
  "embedding",
  "vision",
  "multimodal",
  "speech",
  "image_generation",
  "classical_ml",
  "neural_network",
]);

const ENTITY_TYPES = new Set([
  "trained_model",
  "model_family",
  "architecture",
  "algorithm",
]);

const REASONING_SUPPORT = new Set(["no", "optional", "native"]);
const LOCAL_EXECUTION = new Set(["no", "limited", "yes"]);

const POOL = Object.freeze({
  NORMAL: 0,
  CHALLENGE: 1,
  HARDCORE: 2,
});

const REQUIRED_FIELDS = [
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
  "reasoningSupport",
  "openWeights",
  "localExecution",
  "contextWindowTokens",
  "country",
  "releaseDate",
];

const ids = new Set();
const normalizedNames = new Map();
const guessTerms = new Map();

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function normalize(value) {
  return value.trim().toLocaleLowerCase("en-US");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function validateNullableString(value, field, modelId) {
  assert(
    value === null || isNonEmptyString(value),
    `${field} must be a non-empty string or null: ${modelId}`,
  );
}

function validateStringArray(value, field, modelId) {
  assert(Array.isArray(value), `${field} must be an array: ${modelId}`);
  assert(value.length > 0, `${field} cannot be empty: ${modelId}`);

  for (const item of value) {
    assert(
      isNonEmptyString(item),
      `${field} must contain only non-empty strings: ${modelId}`,
    );
  }

  const normalized = value.map(normalize);

  assert(
    new Set(normalized).size === normalized.length,
    `Duplicate value in ${field}: ${modelId}`,
  );
}

function registerGuessTerm(term, modelId, source) {
  const normalized = normalize(term);
  const existing = guessTerms.get(normalized);

  if (existing && existing.modelId !== modelId) {
    fail(
      `Ambiguous guess term "${term}": ${modelId} (${source}) conflicts with ` +
        `${existing.modelId} (${existing.source})`,
    );
  }

  guessTerms.set(normalized, { modelId, source });
}

assert(Array.isArray(data), "models.seed.json must contain an array");
assert(data.length >= 30, "At least 30 models are required");

for (const model of data) {
  assert(
    model && typeof model === "object" && !Array.isArray(model),
    "Invalid model entry",
  );

  // Keep a stable shape for every entry. A field may be null when it is
  // genuinely not applicable, but it should never silently disappear.
  for (const field of REQUIRED_FIELDS) {
    assert(
      Object.hasOwn(model, field),
      `Missing required field "${field}": ${model.id ?? "<unknown>"}`,
    );
  }

  assert(
    typeof model.id === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(model.id),
    `Invalid model id: ${String(model.id)}`,
  );

  assert(isNonEmptyString(model.name), `Invalid model name: ${model.id}`);

  assert(!ids.has(model.id), `Duplicate model id: ${model.id}`);
  ids.add(model.id);

  const normalizedName = normalize(model.name);
  const existingName = normalizedNames.get(normalizedName);

  assert(
    !existingName,
    `Duplicate model name: ${model.name} (${model.id} / ${existingName})`,
  );

  normalizedNames.set(normalizedName, model.id);

  assert(
    MODEL_CLASSES.has(model.modelClass),
    `Invalid modelClass "${model.modelClass}": ${model.id}`,
  );

  assert(
    ENTITY_TYPES.has(model.entityType),
    `Invalid entityType "${model.entityType}": ${model.id}`,
  );

  assert(
    Number.isInteger(model.minPool) &&
      model.minPool >= POOL.NORMAL &&
      model.minPool <= POOL.HARDCORE,
    `minPool must be 0, 1, or 2: ${model.id}`,
  );

  // Normal remains intentionally focused on recognizable generative LLMs.
  if (model.minPool === POOL.NORMAL) {
    assert(
      ["decoder_llm", "multimodal"].includes(model.modelClass),
      `Normal model must be decoder_llm or multimodal: ${model.id}`,
    );

    assert(
      ["trained_model", "model_family"].includes(model.entityType),
      `Normal model cannot be a generic architecture/algorithm: ${model.id}`,
    );
  }

  validateNullableString(model.provider, "provider", model.id);

  assert(isNonEmptyString(model.family), `Invalid family: ${model.id}`);

  validateNullableString(model.country, "country", model.id);

  assert(
    model.releaseDate === null ||
      (typeof model.releaseDate === "string" &&
        isValidIsoDate(model.releaseDate)),
    `releaseDate must be YYYY-MM-DD or null: ${model.id}`,
  );

  // Concrete released models should have provenance.
  if (model.entityType === "trained_model") {
    assert(model.provider !== null, `trained_model requires provider: ${model.id}`);
    assert(model.country !== null, `trained_model requires country: ${model.id}`);
  }

  validateStringArray(model.aliases, "aliases", model.id);
  validateStringArray(model.categories, "categories", model.id);
  validateStringArray(model.inputModalities, "inputModalities", model.id);
  validateStringArray(model.outputModalities, "outputModalities", model.id);
  validateStringArray(model.useCases, "useCases", model.id);

  assert(
    REASONING_SUPPORT.has(model.reasoningSupport),
    `Invalid reasoningSupport "${model.reasoningSupport}": ${model.id}`,
  );

  assert(
    model.openWeights === null || typeof model.openWeights === "boolean",
    `openWeights must be boolean or null: ${model.id}`,
  );

  assert(
    LOCAL_EXECUTION.has(model.localExecution),
    `Invalid localExecution "${model.localExecution}": ${model.id}`,
  );

  assert(
    model.contextWindowTokens === null ||
      (Number.isInteger(model.contextWindowTokens) &&
        model.contextWindowTokens > 0),
    `contextWindowTokens must be a positive integer or null: ${model.id}`,
  );

  // Normal models are language models, so these fields are meaningful there.
  if (model.minPool === POOL.NORMAL) {
    assert(
      model.categories.includes("language-model"),
      `Normal model must include language-model category: ${model.id}`,
    );

    assert(
      model.outputModalities.includes("text"),
      `Normal model must output text: ${model.id}`,
    );

    assert(
      Number.isInteger(model.contextWindowTokens) &&
        model.contextWindowTokens > 0,
      `Normal model requires contextWindowTokens: ${model.id}`,
    );
  }

  registerGuessTerm(model.name, model.id, "name");

  for (const alias of model.aliases) {
    registerGuessTerm(alias, model.id, "alias");
  }
}

const poolCounts = {
  normal: data.filter((model) => model.minPool <= POOL.NORMAL).length,
  challenge: data.filter((model) => model.minPool <= POOL.CHALLENGE).length,
  hardcore: data.filter((model) => model.minPool <= POOL.HARDCORE).length,
};

assert(
  poolCounts.normal < poolCounts.challenge,
  `Challenge pool should be larger than Normal (${poolCounts.normal} vs ${poolCounts.challenge})`,
);

assert(
  poolCounts.challenge < poolCounts.hardcore,
  `Hardcore pool should be larger than Challenge (${poolCounts.challenge} vs ${poolCounts.hardcore})`,
);

assert(
  poolCounts.hardcore === data.length,
  `Hardcore must contain the complete catalog (${poolCounts.hardcore}/${data.length})`,
);

console.log(
  `Validated ${data.length} entries. ` +
    `Pools: normal=${poolCounts.normal}, ` +
    `challenge=${poolCounts.challenge}, ` +
    `hardcore=${poolCounts.hardcore}.`,
);
