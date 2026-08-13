ALTER TABLE users ADD COLUMN disabled_at BIGINT;
ALTER TABLE users ADD COLUMN disabled_reason TEXT;
ALTER TABLE users ADD COLUMN disabled_by_user_id TEXT REFERENCES users(id);

CREATE INDEX users_disabled_at_idx ON users(disabled_at);
