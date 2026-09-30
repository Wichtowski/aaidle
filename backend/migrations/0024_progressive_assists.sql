CREATE TABLE player_challenge_hints (
    player_id TEXT NOT NULL REFERENCES anonymous_players(id),
    challenge_id TEXT NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
    hint_index INTEGER NOT NULL CHECK (hint_index > 0),
    hint_type TEXT NOT NULL CHECK (hint_type = 'column'),
    target_column TEXT NOT NULL,
    value_json TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (player_id, challenge_id, hint_index),
    UNIQUE (player_id, challenge_id, target_column)
);

CREATE TABLE player_timeline_auto_placements (
    player_id TEXT NOT NULL REFERENCES anonymous_players(id),
    challenge_id TEXT NOT NULL REFERENCES timeline_challenges(id) ON DELETE CASCADE,
    unlock_index INTEGER NOT NULL CHECK (unlock_index > 0),
    card_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (player_id, challenge_id, unlock_index),
    UNIQUE (player_id, challenge_id, card_id)
);
