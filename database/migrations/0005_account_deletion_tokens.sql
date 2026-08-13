CREATE TABLE auth_email_tokens_next (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('email-verification', 'password-reset', 'account-deletion')),
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

INSERT INTO auth_email_tokens_next (id, user_id, token_hash, purpose, expires_at, created_at)
SELECT id, user_id, token_hash, purpose, expires_at, created_at FROM auth_email_tokens;

DROP TABLE auth_email_tokens;
ALTER TABLE auth_email_tokens_next RENAME TO auth_email_tokens;

CREATE INDEX auth_email_tokens_user_purpose_idx ON auth_email_tokens(user_id, purpose);
CREATE INDEX auth_email_tokens_expires_idx ON auth_email_tokens(expires_at);