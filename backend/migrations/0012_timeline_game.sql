CREATE TABLE timeline_items (
  id TEXT PRIMARY KEY NOT NULL,
  item_kind TEXT NOT NULL CHECK(item_kind IN ('model', 'event')),
  model_id TEXT UNIQUE REFERENCES models(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  min_pool_rank INTEGER NOT NULL CHECK(min_pool_rank BETWEEN 0 AND 2),
  release_date TEXT NOT NULL,
  source_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  updated_at INTEGER NOT NULL
);

CREATE TABLE timeline_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_date TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('normal', 'challenge', 'hardcore')),
  model_order_json TEXT NOT NULL,
  anchor_positions_json TEXT NOT NULL,
  tray_order_json TEXT NOT NULL,
  selection_version INTEGER NOT NULL,
  generated_at INTEGER NOT NULL,
  generation_source TEXT NOT NULL,
  UNIQUE(challenge_date, difficulty)
);

CREATE TABLE timeline_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  challenge_id TEXT NOT NULL REFERENCES timeline_challenges(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES anonymous_players(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  model_order_json TEXT NOT NULL,
  placements_json TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
  is_correct INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
  attempts_remaining_after INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(challenge_id, player_id, attempt_number)
);

CREATE TABLE timeline_user_completions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES timeline_challenges(id) ON DELETE CASCADE,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, challenge_id)
);

CREATE INDEX timeline_challenges_date_idx ON timeline_challenges(challenge_date);
CREATE INDEX timeline_attempts_player_challenge_idx ON timeline_attempts(player_id, challenge_id);
CREATE INDEX timeline_attempts_user_challenge_idx ON timeline_attempts(user_id, challenge_id);
CREATE INDEX timeline_user_completions_challenge_idx ON timeline_user_completions(challenge_id);
