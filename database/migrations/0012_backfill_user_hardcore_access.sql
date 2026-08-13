INSERT OR IGNORE INTO user_hardcore_access (user_id, unlocked_at)
SELECT
  user_id,
  updated_at
FROM user_progress
WHERE COALESCE(
  json_extract(
    CASE
      WHEN json_valid(progress_json) THEN progress_json
      ELSE '{}'
    END,
    '$.preferences.hardcoreUnlocked'
  ),
  0
) = 1;
