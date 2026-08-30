CREATE VIEW timeline_speedrun_public_runs AS
SELECT
  a.user_id,
  c.challenge_date,
  COALESCE(NULLIF(u.username, ''), 'Anonymous runner') AS display_name,
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
