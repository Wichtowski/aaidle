CREATE UNIQUE INDEX users_username_ci_idx
  ON users(LOWER(username))
  WHERE username IS NOT NULL;
