CREATE TABLE user_progress_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_player_id TEXT NOT NULL UNIQUE REFERENCES anonymous_players(id),
  reduced_motion INTEGER NOT NULL DEFAULT 0 CHECK(reduced_motion IN (0, 1)),
  high_contrast INTEGER NOT NULL DEFAULT 0 CHECK(high_contrast IN (0, 1)),
  has_seen_classic_privacy INTEGER NOT NULL DEFAULT 0 CHECK(has_seen_classic_privacy IN (0, 1)),
  has_seen_classic_how_to_play INTEGER NOT NULL DEFAULT 0 CHECK(has_seen_classic_how_to_play IN (0, 1)),
  inner_circle_active INTEGER NOT NULL DEFAULT 0 CHECK(inner_circle_active IN (0, 1)),
  hell_mode INTEGER NOT NULL DEFAULT 0 CHECK(hell_mode IN (0, 1)),
  has_autoplayed_hardcore_soundtrack INTEGER NOT NULL DEFAULT 0 CHECK(has_autoplayed_hardcore_soundtrack IN (0, 1)),
  updated_at INTEGER NOT NULL
);

CREATE TABLE user_player_links (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL UNIQUE REFERENCES anonymous_players(id) ON DELETE CASCADE,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, player_id)
);

CREATE TABLE user_game_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, challenge_id)
);

ALTER TABLE guess_events ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE visual_clue_guess_events ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX guess_events_user_challenge_idx ON guess_events(user_id, challenge_id);
CREATE INDEX visual_clue_guess_events_user_challenge_idx ON visual_clue_guess_events(user_id, challenge_id);
CREATE INDEX user_game_states_updated_idx ON user_game_states(user_id, updated_at DESC);

DROP TABLE user_progress;
