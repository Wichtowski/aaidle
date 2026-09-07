CREATE TABLE IF NOT EXISTS logo_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_date TEXT NOT NULL,
  mode TEXT NOT NULL,
  answer_model_id TEXT NOT NULL REFERENCES models(id),
  asset_path TEXT NOT NULL,
  selection_version INTEGER NOT NULL,
  generated_at INTEGER NOT NULL,
  UNIQUE(challenge_date, mode)
);

CREATE TABLE IF NOT EXISTS logo_guess_events (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  challenge_id TEXT NOT NULL REFERENCES logo_challenges(id),
  player_id TEXT NOT NULL REFERENCES anonymous_players(id),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  guessed_model_id TEXT NOT NULL REFERENCES models(id),
  attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 65535),
  is_correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(challenge_id, player_id, guessed_model_id)
);

CREATE TABLE IF NOT EXISTS logo_completion_counts (
  challenge_id TEXT PRIMARY KEY NOT NULL REFERENCES logo_challenges(id),
  completion_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS logo_challenges_date_idx ON logo_challenges(challenge_date);
CREATE INDEX IF NOT EXISTS logo_guess_challenge_idx ON logo_guess_events(challenge_id);
CREATE INDEX IF NOT EXISTS logo_guess_player_idx ON logo_guess_events(player_id);
CREATE INDEX IF NOT EXISTS logo_guess_user_challenge_idx
  ON logo_guess_events(user_id, challenge_id);
