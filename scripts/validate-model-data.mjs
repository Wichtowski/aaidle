import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const input = process.argv[2];
const source = input
  ? new URL(`file://${resolve(input)}`)
  : new URL("../data/models.seed.json", import.meta.url);

const data = JSON.parse(readFileSync(source, "utf8"));

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

const WEIGHT_AVAILABILITY = new Set([
  "open",
  "closed",
  "restricted",
  "unknown",
]);

const REASONING_SUPPORT = new Set(["no", "optional", "native"]);

const FOCUSED_CATEGORIES = new Set([
  "language-model",
  "computer-vision",
  "nlp",
  "object-detection",
  "classical-ml",
]);

const CATEGORY_DETAIL_KEYS = {
  "language-model": new Set([
    "supportedLanguages",
    "toolUse",
    "multimodal",
  ]),
  "computer-vision": new Set([
    "visionTasks",
    "architecture",
    "trainingDatasets",
    "license",
  ]),
  nlp: new Set([
    "nlpTasks",
    "supportedLanguages",
    "architecture",
    "trainingDatasets",
  ]),
  "object-detection": new Set([
    "detectionTypes",
    "architecture",
    "trainingDatasets",
    "realTimeCapable",
  ]),
  "classical-ml": new Set([
    "algorithmTypes",
    "learningParadigms",
    "objectives",
    "featureTypes",
    "frameworks",
  ]),
};

const REQUIRED_GENERAL_FIELDS = [
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
];

const ids = new Set();
const names = new Set();
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

function isKebabCase(value) {
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value);
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function validateNullableString(value, field, id) {
  assert(
    value === null || isNonEmptyString(value),
    `${field} must be a non-empty string or null: ${id}`,
  );
}

function validateSlugArray(value, field, id, { allowEmpty = false } = {}) {
  assert(Array.isArray(value), `${field} must be an array: ${id}`);

  if (!allowEmpty) {
    assert(value.length > 0, `${field} cannot be empty: ${id}`);
  }

  const normalized = [];

  for (const item of value) {
    assert(
      isNonEmptyString(item),
      `${field} contains a non-string/empty value: ${id}`,
    );
    assert(
      isKebabCase(item),
      `${field} must contain kebab-case slugs; got "${item}": ${id}`,
    );
    normalized.push(normalize(item));
  }

  assert(
    new Set(normalized).size === normalized.length,
    `Duplicate value in ${field}: ${id}`,
  );
}

function validateStringArray(value, field, id, { allowEmpty = false } = {}) {
  assert(Array.isArray(value), `${field} must be an array: ${id}`);

  if (!allowEmpty) {
    assert(value.length > 0, `${field} cannot be empty: ${id}`);
  }

  const normalized = [];

  for (const item of value) {
    assert(
      isNonEmptyString(item),
      `${field} contains a non-string/empty value: ${id}`,
    );
    normalized.push(normalize(item));
  }

  assert(
    new Set(normalized).size === normalized.length,
    `Duplicate value in ${field}: ${id}`,
  );
}

function validateNullableBoolean(value, field, id) {
  assert(
    value === null || typeof value === "boolean",
    `${field} must be boolean or null: ${id}`,
  );
}

function validateDetailShape(category, detail, id) {
  assert(
    detail && typeof detail === "object" && !Array.isArray(detail),
    `categoryDetails.${category} must be an object: ${id}`,
  );

  const expected = CATEGORY_DETAIL_KEYS[category];
  const actual = Object.keys(detail);

  assert(
    actual.length === expected.size &&
      actual.every((key) => expected.has(key)),
    `categoryDetails.${category} has invalid keys: ${id}`,
  );

  switch (category) {
    case "language-model":
      validateSlugArray(
        detail.supportedLanguages,
        "categoryDetails.language-model.supportedLanguages",
        id,
        { allowEmpty: true },
      );
      validateNullableBoolean(
        detail.toolUse,
        "categoryDetails.language-model.toolUse",
        id,
      );
      assert(
        typeof detail.multimodal === "boolean",
        `categoryDetails.language-model.multimodal must be boolean: ${id}`,
      );
      break;

    case "computer-vision":
      validateSlugArray(
        detail.visionTasks,
        "categoryDetails.computer-vision.visionTasks",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.architecture,
        "categoryDetails.computer-vision.architecture",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.trainingDatasets,
        "categoryDetails.computer-vision.trainingDatasets",
        id,
        { allowEmpty: true },
      );
      validateNullableString(
        detail.license,
        "categoryDetails.computer-vision.license",
        id,
      );
      if (detail.license !== null) {
        assert(
          isKebabCase(detail.license),
          `CV license must be a kebab-case slug: ${id}`,
        );
      }
      break;

    case "nlp":
      validateSlugArray(
        detail.nlpTasks,
        "categoryDetails.nlp.nlpTasks",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.supportedLanguages,
        "categoryDetails.nlp.supportedLanguages",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.architecture,
        "categoryDetails.nlp.architecture",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.trainingDatasets,
        "categoryDetails.nlp.trainingDatasets",
        id,
        { allowEmpty: true },
      );
      break;

    case "object-detection":
      validateSlugArray(
        detail.detectionTypes,
        "categoryDetails.object-detection.detectionTypes",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.architecture,
        "categoryDetails.object-detection.architecture",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.trainingDatasets,
        "categoryDetails.object-detection.trainingDatasets",
        id,
        { allowEmpty: true },
      );
      validateNullableBoolean(
        detail.realTimeCapable,
        "categoryDetails.object-detection.realTimeCapable",
        id,
      );
      break;

    case "classical-ml":
      validateSlugArray(
        detail.algorithmTypes,
        "categoryDetails.classical-ml.algorithmTypes",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.learningParadigms,
        "categoryDetails.classical-ml.learningParadigms",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.objectives,
        "categoryDetails.classical-ml.objectives",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.featureTypes,
        "categoryDetails.classical-ml.featureTypes",
        id,
        { allowEmpty: true },
      );
      validateSlugArray(
        detail.frameworks,
        "categoryDetails.classical-ml.frameworks",
        id,
        { allowEmpty: true },
      );
      break;
  }
}

function registerGuessTerm(term, modelId, sourceName) {
  const normalized = normalize(term);
  const existing = guessTerms.get(normalized);

  if (existing && existing.modelId !== modelId) {
    fail(
      `Ambiguous guess term "${term}": ${modelId} (${sourceName}) conflicts ` +
        `with ${existing.modelId} (${existing.sourceName})`,
    );
  }

  guessTerms.set(normalized, { modelId, sourceName });
}

assert(Array.isArray(data), "Seed must be a JSON array");
assert(data.length >= 30, "At least 30 catalogue entries are required");

for (const model of data) {
  assert(
    model && typeof model === "object" && !Array.isArray(model),
    "Invalid catalogue entry",
  );

  for (const field of REQUIRED_GENERAL_FIELDS) {
    assert(
      Object.hasOwn(model, field),
      `Missing required field "${field}": ${model.id ?? "<unknown>"}`,
    );
  }

  // Removed fields must stay removed.
  assert(
    !Object.hasOwn(model, "localExecution"),
    `localExecution is deprecated: ${model.id}`,
  );
  assert(
    !Object.hasOwn(model, "openWeights"),
    `openWeights is deprecated; use weightAvailability: ${model.id}`,
  );

  // Identity
  assert(
    typeof model.id === "string" && isKebabCase(model.id),
    `Invalid id: ${String(model.id)}`,
  );
  assert(isNonEmptyString(model.name), `Invalid name: ${model.id}`);

  assert(!ids.has(model.id), `Duplicate id: ${model.id}`);
  ids.add(model.id);

  const normalizedName = normalize(model.name);
  assert(!names.has(normalizedName), `Duplicate name: ${model.name}`);
  names.add(normalizedName);

  // Internal classification — kept deliberately even though it is not a board clue.
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
      model.minPool >= 0 &&
      model.minPool <= 2,
    `minPool must be 0, 1, or 2: ${model.id}`,
  );

  // General game/provenance metadata
  assert(isNonEmptyString(model.provider), `Invalid provider: ${model.id}`);
  assert(isNonEmptyString(model.family), `Invalid family: ${model.id}`);
  validateStringArray(model.aliases, "aliases", model.id);
  validateSlugArray(model.categories, "categories", model.id);
  validateSlugArray(model.inputModalities, "inputModalities", model.id);
  validateSlugArray(model.outputModalities, "outputModalities", model.id);
  validateSlugArray(model.useCases, "useCases", model.id);
  assert(isNonEmptyString(model.country), `Invalid country: ${model.id}`);

  assert(
    WEIGHT_AVAILABILITY.has(model.weightAvailability),
    `Invalid weightAvailability "${model.weightAvailability}": ${model.id}`,
  );

  assert(
    isIsoDate(model.releaseDate),
    `releaseDate must be YYYY-MM-DD: ${model.id}`,
  );

  // Optional semantic fields
  if (Object.hasOwn(model, "reasoningSupport")) {
    assert(
      REASONING_SUPPORT.has(model.reasoningSupport),
      `Invalid reasoningSupport "${model.reasoningSupport}": ${model.id}`,
    );
    assert(
      model.categories.includes("language-model") &&
        (model.reasoningSupport === "no" || ["decoder_llm", "multimodal"].includes(model.modelClass)),
      `native/optional reasoning only belongs on generative language models: ${model.id}`,
    );
  }

  if (Object.hasOwn(model, "contextWindowTokens")) {
    assert(
      Number.isInteger(model.contextWindowTokens) &&
        model.contextWindowTokens > 0,
      `contextWindowTokens must be a positive integer: ${model.id}`,
    );
    assert(
      model.categories.includes("language-model") ||
        model.categories.includes("nlp"),
      `contextWindowTokens only belongs on language-model/nlp entries: ${model.id}`,
    );
  }

  // categoryDetails must exactly follow focused category membership.
  assert(
    model.categoryDetails &&
      typeof model.categoryDetails === "object" &&
      !Array.isArray(model.categoryDetails),
    `categoryDetails must be an object: ${model.id}`,
  );

  for (const key of Object.keys(model.categoryDetails)) {
    assert(
      FOCUSED_CATEGORIES.has(key),
      `Unsupported categoryDetails key "${key}": ${model.id}`,
    );
    assert(
      model.categories.includes(key),
      `categoryDetails.${key} exists but categories does not include ${key}: ${model.id}`,
    );
    validateDetailShape(key, model.categoryDetails[key], model.id);
  }

  for (const category of FOCUSED_CATEGORIES) {
    if (model.categories.includes(category)) {
      assert(
        Object.hasOwn(model.categoryDetails, category),
        `Missing categoryDetails.${category}: ${model.id}`,
      );
    }
  }

  // Cross-check a few semantics with internal classification.
  if (model.categories.includes("classical-ml")) {
    assert(
      model.modelClass === "classical_ml",
      `classical-ml category requires modelClass=classical_ml: ${model.id}`,
    );
  }

  if (model.categories.includes("object-detection")) {
    assert(
      model.categories.includes("computer-vision"),
      `object-detection must also include computer-vision: ${model.id}`,
    );
  }

  // Guess input collisions
  registerGuessTerm(model.name, model.id, "name");
  for (const alias of model.aliases) {
    registerGuessTerm(alias, model.id, "alias");
  }
}

const poolCounts = {
  normal: data.filter((m) => m.minPool <= 0).length,
  challenge: data.filter((m) => m.minPool <= 1).length,
  hardcore: data.filter((m) => m.minPool <= 2).length,
};

assert(
  poolCounts.hardcore === data.length,
  `Hardcore must include the entire catalogue`,
);

console.log(
  `Validated ${data.length} entries. ` +
    `Pools: normal=${poolCounts.normal}, ` +
    `challenge=${poolCounts.challenge}, ` +
    `hardcore=${poolCounts.hardcore}.`,
);
