CREATE TABLE IF NOT EXISTS model_game_metadata (
  model_id TEXT PRIMARY KEY NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  min_pool_rank INTEGER NOT NULL DEFAULT 0 CHECK(min_pool_rank BETWEEN 0 AND 2),
  country TEXT,
  weight_availability TEXT,
  category_details_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS emoji_puzzles (
  family_id TEXT PRIMARY KEY NOT NULL REFERENCES model_families(id),
  puzzle_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS challenge_completion_counts (
  challenge_id TEXT PRIMARY KEY NOT NULL REFERENCES daily_challenges(id),
  completion_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS emoji_guess_events (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
  player_id TEXT NOT NULL REFERENCES anonymous_players(id),
  guessed_family_id TEXT NOT NULL REFERENCES model_families(id),
  attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 100),
  is_correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(challenge_id, player_id, guessed_family_id)
);

CREATE INDEX IF NOT EXISTS emoji_guess_challenge_idx ON emoji_guess_events(challenge_id);
CREATE INDEX IF NOT EXISTS emoji_guess_player_idx ON emoji_guess_events(player_id);
