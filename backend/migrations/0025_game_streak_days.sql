-- Only server-accepted completions made on their challenge's UTC day qualify.
-- Keeping the original qualifying dates also preserves evidence during account merges.
CREATE TABLE player_game_streak_days (
  player_id TEXT NOT NULL REFERENCES anonymous_players(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK(game_type IN ('classic','timeline','emoji','logo')),
  game_date TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, game_type, game_date)
);

INSERT OR IGNORE INTO player_game_streak_days
SELECT g.player_id, 'classic', d.challenge_date, g.created_at
FROM guess_events g JOIN daily_challenges d ON d.id = g.challenge_id
WHERE g.is_correct = 1 AND d.challenge_date = strftime('%Y-%m-%d', g.created_at / 1000.0, 'unixepoch');
INSERT OR IGNORE INTO player_game_streak_days
SELECT g.player_id, 'emoji', d.challenge_date, g.created_at
FROM visual_clue_guess_events g JOIN visual_clue_challenges d ON d.id = g.challenge_id
WHERE g.is_correct = 1 AND d.challenge_date = strftime('%Y-%m-%d', g.created_at / 1000.0, 'unixepoch');
INSERT OR IGNORE INTO player_game_streak_days
SELECT g.player_id, 'logo', d.challenge_date, g.created_at
FROM logo_guess_events g JOIN logo_challenges d ON d.id = g.challenge_id
WHERE g.is_correct = 1 AND d.challenge_date = strftime('%Y-%m-%d', g.created_at / 1000.0, 'unixepoch');
INSERT OR IGNORE INTO player_game_streak_days
SELECT g.player_id, 'timeline', d.challenge_date, g.created_at
FROM timeline_attempts g JOIN timeline_challenges d ON d.id = g.challenge_id
WHERE g.is_correct = 1 AND d.challenge_date = strftime('%Y-%m-%d', g.created_at / 1000.0, 'unixepoch');

CREATE TRIGGER classic_streak_completion AFTER INSERT ON guess_events WHEN NEW.is_correct = 1
BEGIN
  INSERT OR IGNORE INTO player_game_streak_days
  SELECT NEW.player_id, 'classic', challenge_date, NEW.created_at FROM daily_challenges
  WHERE id = NEW.challenge_id AND challenge_date = strftime('%Y-%m-%d', NEW.created_at / 1000.0, 'unixepoch');
END;
CREATE TRIGGER emoji_streak_completion AFTER INSERT ON visual_clue_guess_events WHEN NEW.is_correct = 1
BEGIN
  INSERT OR IGNORE INTO player_game_streak_days
  SELECT NEW.player_id, 'emoji', challenge_date, NEW.created_at FROM visual_clue_challenges
  WHERE id = NEW.challenge_id AND challenge_date = strftime('%Y-%m-%d', NEW.created_at / 1000.0, 'unixepoch');
END;
CREATE TRIGGER logo_streak_completion AFTER INSERT ON logo_guess_events WHEN NEW.is_correct = 1
BEGIN
  INSERT OR IGNORE INTO player_game_streak_days
  SELECT NEW.player_id, 'logo', challenge_date, NEW.created_at FROM logo_challenges
  WHERE id = NEW.challenge_id AND challenge_date = strftime('%Y-%m-%d', NEW.created_at / 1000.0, 'unixepoch');
END;
CREATE TRIGGER timeline_streak_completion AFTER INSERT ON timeline_attempts WHEN NEW.is_correct = 1
BEGIN
  INSERT OR IGNORE INTO player_game_streak_days
  SELECT NEW.player_id, 'timeline', challenge_date, NEW.created_at FROM timeline_challenges
  WHERE id = NEW.challenge_id AND challenge_date = strftime('%Y-%m-%d', NEW.created_at / 1000.0, 'unixepoch');
END;
