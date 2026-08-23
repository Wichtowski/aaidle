CREATE TABLE guess_events_new (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
  player_id TEXT NOT NULL REFERENCES anonymous_players(id),
  guessed_model_id TEXT NOT NULL REFERENCES models(id),
  attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 65535),
  is_correct INTEGER NOT NULL,
  comparison_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(challenge_id, player_id, guessed_model_id)
);

INSERT INTO guess_events_new
  (id, request_id, challenge_id, player_id, guessed_model_id, attempt_number, is_correct, comparison_json, created_at, user_id)
SELECT id, request_id, challenge_id, player_id, guessed_model_id, attempt_number, is_correct, comparison_json, created_at, user_id
FROM guess_events;

DROP TABLE guess_events;
ALTER TABLE guess_events_new RENAME TO guess_events;

CREATE INDEX guess_challenge_idx ON guess_events(challenge_id);
CREATE INDEX guess_player_idx ON guess_events(player_id);
CREATE INDEX guess_model_idx ON guess_events(guessed_model_id);
CREATE INDEX guess_events_user_challenge_idx ON guess_events(user_id, challenge_id);

CREATE TABLE visual_clue_guess_events_new (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  challenge_id TEXT NOT NULL REFERENCES visual_clue_challenges(id),
  player_id TEXT NOT NULL REFERENCES anonymous_players(id),
  guessed_entity_id TEXT NOT NULL REFERENCES visual_clue_entities(id),
  attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 65535),
  is_correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(challenge_id, player_id, guessed_entity_id)
);

INSERT INTO visual_clue_guess_events_new
  (id, request_id, challenge_id, player_id, guessed_entity_id, attempt_number, is_correct, created_at, user_id)
SELECT id, request_id, challenge_id, player_id, guessed_entity_id, attempt_number, is_correct, created_at, user_id
FROM visual_clue_guess_events;

DROP TABLE visual_clue_guess_events;
ALTER TABLE visual_clue_guess_events_new RENAME TO visual_clue_guess_events;

CREATE INDEX visual_clue_guess_challenge_idx ON visual_clue_guess_events(challenge_id);
CREATE INDEX visual_clue_guess_events_user_challenge_idx ON visual_clue_guess_events(user_id, challenge_id);
