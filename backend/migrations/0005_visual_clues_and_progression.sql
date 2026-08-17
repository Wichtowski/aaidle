CREATE TABLE IF NOT EXISTS visual_clue_entities (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ('emoji', 'architecture', 'algorithm', 'operator')),
  categories_json TEXT NOT NULL,
  min_pool INTEGER NOT NULL CHECK(min_pool BETWEEN 0 AND 2),
  entity_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS visual_clue_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_date TEXT NOT NULL,
  mode TEXT NOT NULL,
  answer_entity_id TEXT NOT NULL REFERENCES visual_clue_entities(id),
  variant_id TEXT NOT NULL,
  selection_version INTEGER NOT NULL,
  generated_at INTEGER NOT NULL,
  UNIQUE(challenge_date, mode)
);

CREATE TABLE IF NOT EXISTS visual_clue_guess_events (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  challenge_id TEXT NOT NULL REFERENCES visual_clue_challenges(id),
  player_id TEXT NOT NULL REFERENCES anonymous_players(id),
  guessed_entity_id TEXT NOT NULL REFERENCES visual_clue_entities(id),
  attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 100),
  is_correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(challenge_id, player_id, guessed_entity_id)
);

CREATE TABLE IF NOT EXISTS visual_clue_completion_counts (
  challenge_id TEXT PRIMARY KEY NOT NULL REFERENCES visual_clue_challenges(id),
  completion_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_game_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  category TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, game_type, difficulty, category)
);

CREATE TABLE IF NOT EXISTS user_unlocks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unlock_key TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, unlock_key)
);

CREATE INDEX IF NOT EXISTS visual_clue_challenges_date_idx ON visual_clue_challenges(challenge_date);
CREATE INDEX IF NOT EXISTS visual_clue_guess_challenge_idx ON visual_clue_guess_events(challenge_id);
CREATE INDEX IF NOT EXISTS user_game_progress_lookup_idx ON user_game_progress(user_id, game_type, difficulty);