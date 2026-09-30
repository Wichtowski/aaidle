CREATE TABLE daily_completion_requirement_snapshots (
  challenge_date TEXT PRIMARY KEY NOT NULL,
  requirement_version INTEGER NOT NULL,
  requirements_json TEXT NOT NULL
);

CREATE TABLE user_daily_completion_milestones (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_date TEXT NOT NULL,
  requirement_version INTEGER NOT NULL,
  highest_celebrated_tier TEXT CHECK(highest_celebrated_tier IN ('normal','challenge','hardcore')),
  goat_seen_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, challenge_date, requirement_version)
);
