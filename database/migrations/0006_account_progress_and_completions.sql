CREATE TABLE user_progress (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_json TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE user_challenge_completions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
  completed_at BIGINT NOT NULL,
  PRIMARY KEY(user_id, challenge_id)
);

CREATE INDEX user_challenge_completions_challenge_idx
ON user_challenge_completions(challenge_id);
