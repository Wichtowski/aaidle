CREATE TABLE challenge_completion_counts (
  challenge_id TEXT PRIMARY KEY NOT NULL REFERENCES daily_challenges(id),
  completion_count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO challenge_completion_counts (challenge_id, completion_count)
SELECT challenge_id, COUNT(*)
FROM user_challenge_completions
GROUP BY challenge_id;

CREATE TRIGGER user_challenge_completions_increment_count
AFTER INSERT ON user_challenge_completions
BEGIN
  INSERT INTO challenge_completion_counts (challenge_id, completion_count)
  VALUES (NEW.challenge_id, 1)
  ON CONFLICT(challenge_id) DO UPDATE SET completion_count = completion_count + 1;
END;
