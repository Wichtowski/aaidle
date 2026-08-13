CREATE TABLE user_hardcore_access (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unlocked_at BIGINT NOT NULL
);
