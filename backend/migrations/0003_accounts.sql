CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT,
  email_verified_at INTEGER,
  permission TEXT NOT NULL DEFAULT 'user' CHECK(permission IN ('user', 'developer', 'superadmin')),
  disabled_at INTEGER,
  disabled_reason TEXT,
  disabled_by_user_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_identities (
  provider TEXT NOT NULL CHECK(provider IN ('github', 'google')),
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(provider, provider_user_id),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_email_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('email-verification', 'password-reset', 'account-deletion')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(scope, subject_hash)
);

CREATE TABLE IF NOT EXISTS user_progress (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_challenge_completions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
  completed_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS user_hardcore_access (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unlocked_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS users_disabled_at_idx ON users(disabled_at);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_email_tokens_user_purpose_idx ON auth_email_tokens(user_id, purpose);
CREATE INDEX IF NOT EXISTS auth_email_tokens_expires_idx ON auth_email_tokens(expires_at);
CREATE INDEX IF NOT EXISTS user_challenge_completions_challenge_idx ON user_challenge_completions(challenge_id);
