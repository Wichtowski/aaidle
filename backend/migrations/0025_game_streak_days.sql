-- One row per player, game family and game day that secured the family streak.
-- New rows are written by the Rust completion paths (repository::streaks); this migration
-- only creates the table and backfills completions made on their challenge's UTC day.
-- Keeping the original qualifying dates also preserves evidence during account merges.
CREATE TABLE player_game_streak_days (
  player_id TEXT NOT NULL REFERENCES anonymous_players(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK(game_type IN ('classic','timeline','emoji','logo')),
  game_date TEXT NOT NULL CHECK(game_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  completed_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, game_type, game_date)
);

INSERT INTO player_game_streak_days
SELECT g.player_id, 'classic', d.challenge_date, MIN(g.created_at)
FROM guess_events g JOIN daily_challenges d ON d.id = g.challenge_id
WHERE g.is_correct = 1 AND d.challenge_date = strftime('%Y-%m-%d', g.created_at / 1000.0, 'unixepoch')
GROUP BY g.player_id, d.challenge_date;
INSERT INTO player_game_streak_days
SELECT g.player_id, 'emoji', d.challenge_date, MIN(g.created_at)
FROM visual_clue_guess_events g JOIN visual_clue_challenges d ON d.id = g.challenge_id
WHERE g.is_correct = 1 AND d.challenge_date = strftime('%Y-%m-%d', g.created_at / 1000.0, 'unixepoch')
GROUP BY g.player_id, d.challenge_date;
INSERT INTO player_game_streak_days
SELECT g.player_id, 'logo', d.challenge_date, MIN(g.created_at)
FROM logo_guess_events g JOIN logo_challenges d ON d.id = g.challenge_id
WHERE g.is_correct = 1 AND d.challenge_date = strftime('%Y-%m-%d', g.created_at / 1000.0, 'unixepoch')
GROUP BY g.player_id, d.challenge_date;
INSERT INTO player_game_streak_days
SELECT g.player_id, 'timeline', d.challenge_date, MIN(g.created_at)
FROM timeline_attempts g JOIN timeline_challenges d ON d.id = g.challenge_id
WHERE g.is_correct = 1 AND d.challenge_date = strftime('%Y-%m-%d', g.created_at / 1000.0, 'unixepoch')
GROUP BY g.player_id, d.challenge_date;
