CREATE TABLE timeline_speedrun_starts (
  challenge_id TEXT NOT NULL REFERENCES timeline_challenges(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES anonymous_players(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  PRIMARY KEY(challenge_id, player_id)
);

CREATE INDEX timeline_speedrun_starts_player_idx
  ON timeline_speedrun_starts(player_id, challenge_id);
