PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  country_code TEXT,
  website TEXT,
  logo_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_families (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider_id, slug)
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  family_id TEXT REFERENCES model_families(id),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  release_date TEXT,
  release_year INTEGER,
  context_window_tokens INTEGER,
  open_weights INTEGER,
  local_execution TEXT NOT NULL,
  reasoning_support TEXT NOT NULL,
  status TEXT NOT NULL,
  is_guessable INTEGER NOT NULL DEFAULT 1,
  verified_at TEXT NOT NULL,
  source_label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  model_id TEXT NOT NULL REFERENCES models(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  UNIQUE(model_id, normalized_alias)
);

CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS modalities (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS use_cases (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS model_categories (model_id TEXT NOT NULL REFERENCES models(id), category_id TEXT NOT NULL REFERENCES categories(id), PRIMARY KEY(model_id, category_id));
CREATE TABLE IF NOT EXISTS model_input_modalities (model_id TEXT NOT NULL REFERENCES models(id), modality_id TEXT NOT NULL REFERENCES modalities(id), PRIMARY KEY(model_id, modality_id));
CREATE TABLE IF NOT EXISTS model_output_modalities (model_id TEXT NOT NULL REFERENCES models(id), modality_id TEXT NOT NULL REFERENCES modalities(id), PRIMARY KEY(model_id, modality_id));
CREATE TABLE IF NOT EXISTS model_use_cases (model_id TEXT NOT NULL REFERENCES models(id), use_case_id TEXT NOT NULL REFERENCES use_cases(id), PRIMARY KEY(model_id, use_case_id));

CREATE TABLE IF NOT EXISTS daily_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_date TEXT NOT NULL,
  mode TEXT NOT NULL,
  answer_model_id TEXT NOT NULL REFERENCES models(id),
  selection_version INTEGER NOT NULL,
  generated_at INTEGER NOT NULL,
  generation_source TEXT NOT NULL,
  UNIQUE(challenge_date, mode)
);

CREATE TABLE IF NOT EXISTS anonymous_players (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_mode_stats (
  player_id TEXT NOT NULL REFERENCES anonymous_players(id),
  mode TEXT NOT NULL,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  last_played_date TEXT,
  last_solved_date TEXT,
  guess_distribution_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, mode)
);

CREATE TABLE IF NOT EXISTS guess_events (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
  player_id TEXT NOT NULL REFERENCES anonymous_players(id),
  guessed_model_id TEXT NOT NULL REFERENCES models(id),
  attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 100),
  is_correct INTEGER NOT NULL,
  comparison_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(challenge_id, player_id, guessed_model_id)
);

CREATE TABLE IF NOT EXISTS challenge_guess_stats (
  challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
  guessed_model_id TEXT NOT NULL REFERENCES models(id),
  total_guess_count INTEGER NOT NULL DEFAULT 0,
  unique_player_count INTEGER NOT NULL DEFAULT 0,
  correct_guess_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(challenge_id, guessed_model_id)
);

CREATE INDEX IF NOT EXISTS providers_active_idx ON providers(is_active);
CREATE INDEX IF NOT EXISTS models_provider_idx ON models(provider_id);
CREATE INDEX IF NOT EXISTS models_family_idx ON models(family_id);
CREATE INDEX IF NOT EXISTS models_guessable_status_idx ON models(is_guessable, status);
CREATE INDEX IF NOT EXISTS daily_date_idx ON daily_challenges(challenge_date);
CREATE INDEX IF NOT EXISTS daily_model_idx ON daily_challenges(answer_model_id);
CREATE INDEX IF NOT EXISTS player_stats_player_idx ON player_mode_stats(player_id);
CREATE INDEX IF NOT EXISTS guess_challenge_idx ON guess_events(challenge_id);
CREATE INDEX IF NOT EXISTS guess_player_idx ON guess_events(player_id);
CREATE INDEX IF NOT EXISTS guess_model_idx ON guess_events(guessed_model_id);
CREATE INDEX IF NOT EXISTS challenge_guess_model_idx ON challenge_guess_stats(guessed_model_id);
