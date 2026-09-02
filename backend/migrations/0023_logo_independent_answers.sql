PRAGMA foreign_keys = OFF;

ALTER TABLE logo_guess_events RENAME TO logo_guess_events_old;
ALTER TABLE logo_completion_counts RENAME TO logo_completion_counts_old;
ALTER TABLE logo_challenges RENAME TO logo_challenges_old;

CREATE TABLE logo_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_date TEXT NOT NULL,
  mode TEXT NOT NULL,
  answer_model_id TEXT NOT NULL,
  asset_path TEXT NOT NULL,
  selection_version INTEGER NOT NULL,
  generated_at INTEGER NOT NULL,
  UNIQUE(challenge_date, mode)
);
INSERT INTO logo_challenges
SELECT id, challenge_date, mode, answer_model_id, asset_path, selection_version, generated_at
FROM logo_challenges_old;

CREATE TABLE logo_guess_events (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  challenge_id TEXT NOT NULL REFERENCES logo_challenges(id),
  player_id TEXT NOT NULL REFERENCES anonymous_players(id),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  guessed_model_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 65535),
  is_correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(challenge_id, player_id, guessed_model_id)
);
INSERT INTO logo_guess_events
SELECT id, request_id, challenge_id, player_id, user_id, guessed_model_id,
       attempt_number, is_correct, created_at
FROM logo_guess_events_old;

CREATE TABLE logo_completion_counts (
  challenge_id TEXT PRIMARY KEY NOT NULL REFERENCES logo_challenges(id),
  completion_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO logo_completion_counts
SELECT challenge_id, completion_count FROM logo_completion_counts_old;

DROP TABLE logo_guess_events_old;
DROP TABLE logo_completion_counts_old;
DROP TABLE logo_challenges_old;

CREATE INDEX logo_challenges_date_idx ON logo_challenges(challenge_date);
CREATE INDEX logo_guess_challenge_idx ON logo_guess_events(challenge_id);
CREATE INDEX logo_guess_player_idx ON logo_guess_events(player_id);
CREATE INDEX logo_guess_user_challenge_idx ON logo_guess_events(user_id, challenge_id);

PRAGMA foreign_keys = ON;
