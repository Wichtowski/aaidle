import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
};
export const providers = sqliteTable(
  "providers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    countryCode: text("country_code"),
    website: text("website"),
    logoPath: text("logo_path"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [index("providers_active_idx").on(table.isActive)],
);
export const modelFamilies = sqliteTable(
  "model_families",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("families_provider_slug_unique").on(table.providerId, table.slug)],
);
export const models = sqliteTable(
  "models",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    familyId: text("family_id").references(() => modelFamilies.id),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    releaseDate: text("release_date"),
    releaseYear: integer("release_year"),
    contextWindowTokens: integer("context_window_tokens"),
    openWeights: integer("open_weights", { mode: "boolean" }),
    localExecution: text("local_execution", {
      enum: ["yes", "no", "limited", "unknown"],
    }).notNull(),
    reasoningSupport: text("reasoning_support", {
      enum: ["native", "optional", "no", "unknown"],
    }).notNull(),
    status: text("status", { enum: ["preview", "active", "deprecated", "unavailable"] }).notNull(),
    isGuessable: integer("is_guessable", { mode: "boolean" }).notNull().default(true),
    verifiedAt: text("verified_at").notNull(),
    sourceLabel: text("source_label").notNull(),
    ...timestamps,
  },
  (table) => [
    index("models_provider_idx").on(table.providerId),
    index("models_family_idx").on(table.familyId),
    index("models_guessable_status_idx").on(table.isGuessable, table.status),
  ],
);
export const modelAliases = sqliteTable(
  "model_aliases",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
  },
  (table) => [
    uniqueIndex("aliases_model_normalized_unique").on(table.modelId, table.normalizedAlias),
  ],
);
const dictionary = (name: string) =>
  sqliteTable(name, {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
  });
export const categories = dictionary("categories");
export const modalities = dictionary("modalities");
export const useCases = dictionary("use_cases");
export const modelCategories = sqliteTable(
  "model_categories",
  {
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.categoryId] })],
);
export const modelInputModalities = sqliteTable(
  "model_input_modalities",
  {
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    modalityId: text("modality_id")
      .notNull()
      .references(() => modalities.id),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.modalityId] })],
);
export const modelOutputModalities = sqliteTable(
  "model_output_modalities",
  {
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    modalityId: text("modality_id")
      .notNull()
      .references(() => modalities.id),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.modalityId] })],
);
export const modelUseCases = sqliteTable(
  "model_use_cases",
  {
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    useCaseId: text("use_case_id")
      .notNull()
      .references(() => useCases.id),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.useCaseId] })],
);
export const dailyChallenges = sqliteTable(
  "daily_challenges",
  {
    id: text("id").primaryKey(),
    challengeDate: text("challenge_date").notNull(),
    mode: text("mode").notNull(),
    answerModelId: text("answer_model_id")
      .notNull()
      .references(() => models.id),
    selectionVersion: integer("selection_version").notNull(),
    generatedAt: integer("generated_at").notNull(),
    generationSource: text("generation_source").notNull(),
  },
  (t) => [
    uniqueIndex("daily_date_mode_unique").on(t.challengeDate, t.mode),
    index("daily_date_idx").on(t.challengeDate),
    index("daily_model_idx").on(t.answerModelId),
  ],
);
export const anonymousPlayers = sqliteTable("anonymous_players", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull().unique(),
    displayName: text("display_name"),
    passwordHash: text("password_hash"),
    emailVerifiedAt: integer("email_verified_at"),
    ...timestamps,
  },
);
export const userIdentities = sqliteTable(
  "user_identities",
  {
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerUserId] })],
);
export const userSessions = sqliteTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (t) => [index("user_sessions_user_idx").on(t.userId), index("user_sessions_expires_idx").on(t.expiresAt)],
);
export const playerModeStats = sqliteTable(
  "player_mode_stats",
  {
    playerId: text("player_id")
      .notNull()
      .references(() => anonymousPlayers.id),
    mode: text("mode").notNull(),
    currentStreak: integer("current_streak").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
    gamesPlayed: integer("games_played").notNull().default(0),
    gamesWon: integer("games_won").notNull().default(0),
    lastPlayedDate: text("last_played_date"),
    lastSolvedDate: text("last_solved_date"),
    guessDistributionJson: text("guess_distribution_json").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.mode] }),
    index("player_stats_player_idx").on(t.playerId),
  ],
);
export const guessEvents = sqliteTable(
  "guess_events",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull().unique(),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => dailyChallenges.id),
    playerId: text("player_id")
      .notNull()
      .references(() => anonymousPlayers.id),
    guessedModelId: text("guessed_model_id")
      .notNull()
      .references(() => models.id),
    attemptNumber: integer("attempt_number").notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
    comparisonJson: text("comparison_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("guess_unique_player_model").on(t.challengeId, t.playerId, t.guessedModelId),
    index("guess_challenge_idx").on(t.challengeId),
    index("guess_player_idx").on(t.playerId),
    index("guess_model_idx").on(t.guessedModelId),
  ],
);
export const challengeGuessStats = sqliteTable(
  "challenge_guess_stats",
  {
    challengeId: text("challenge_id")
      .notNull()
      .references(() => dailyChallenges.id),
    guessedModelId: text("guessed_model_id")
      .notNull()
      .references(() => models.id),
    totalGuessCount: integer("total_guess_count").notNull().default(0),
    uniquePlayerCount: integer("unique_player_count").notNull().default(0),
    correctGuessCount: integer("correct_guess_count").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.challengeId, t.guessedModelId] }),
    index("challenge_guess_model_idx").on(t.guessedModelId),
  ],
);
