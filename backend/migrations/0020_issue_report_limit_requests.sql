DROP VIEW timeline_speedrun_public_stats;
DROP VIEW timeline_speedrun_public_runs;

CREATE TABLE users_with_issue_report_requests (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT,
  email_verified_at INTEGER,
  permission TEXT NOT NULL DEFAULT 'user' CHECK(permission IN ('user', 'developer', 'superadmin')),
  disabled_at INTEGER,
  disabled_reason TEXT,
  disabled_by_user_id TEXT REFERENCES users_with_issue_report_requests(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  issue_report_limit INTEGER NOT NULL DEFAULT 2 CHECK(issue_report_limit >= 0 AND issue_report_limit <= 1000),
  username TEXT,
  issue_report_limit_requested_at INTEGER
);

INSERT INTO users_with_issue_report_requests (
  id, email, email_normalized, display_name, password_hash, email_verified_at, permission,
  disabled_at, disabled_reason, disabled_by_user_id, created_at, updated_at, issue_report_limit, username
)
SELECT
  id, email, email_normalized, display_name, password_hash, email_verified_at, permission,
  disabled_at, disabled_reason, disabled_by_user_id, created_at, updated_at,
  CASE WHEN issue_report_limit = 3 THEN 2 ELSE issue_report_limit END,
  username
FROM users;

DROP TABLE users;
ALTER TABLE users_with_issue_report_requests RENAME TO users;

CREATE INDEX users_disabled_at_idx ON users(disabled_at);
CREATE UNIQUE INDEX users_username_idx ON users(username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX users_username_ci_idx ON users(LOWER(username)) WHERE username IS NOT NULL;

CREATE VIEW timeline_speedrun_public_runs AS
SELECT
  a.user_id,
  c.challenge_date,
  COALESCE(
    NULLIF(u.username, ''),
    CASE
      WHEN INSTR(u.email, '@') > 1 THEN SUBSTR(u.email, 1, INSTR(u.email, '@') - 1)
      ELSE u.email
    END
  ) AS display_name,
  a.attempt_number AS submissions,
  a.speedrun_time_ms AS time_ms,
  a.created_at
FROM timeline_attempts a
JOIN timeline_challenges c ON c.id = a.challenge_id
JOIN users u ON u.id = a.user_id
WHERE c.difficulty = 'speedrun'
  AND a.is_correct = 1
  AND a.speedrun_time_ms IS NOT NULL
  AND u.disabled_at IS NULL;

CREATE VIEW timeline_speedrun_public_stats AS
SELECT
  user_id,
  MAX(display_name) AS display_name,
  COUNT(*) AS completed_speedruns,
  CAST(ROUND(AVG(time_ms)) AS INTEGER) AS average_time_ms,
  ROUND(AVG(submissions), 2) AS average_submissions,
  MIN(time_ms) AS fastest_time_ms
FROM timeline_speedrun_public_runs
GROUP BY user_id;
