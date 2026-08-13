CREATE TABLE auth_email_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('email-verification', 'password-reset')),
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX auth_email_tokens_user_purpose_idx ON auth_email_tokens(user_id, purpose);
CREATE INDEX auth_email_tokens_expires_idx ON auth_email_tokens(expires_at);
