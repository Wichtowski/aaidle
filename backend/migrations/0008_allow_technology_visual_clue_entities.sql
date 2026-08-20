-- no-transaction
PRAGMA foreign_keys = OFF;

CREATE TABLE visual_clue_entities_replacement (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ('emoji', 'architecture', 'algorithm', 'operator', 'technology')),
  categories_json TEXT NOT NULL,
  min_pool INTEGER NOT NULL CHECK(min_pool BETWEEN 0 AND 2),
  entity_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO visual_clue_entities_replacement (
  id,
  name,
  aliases_json,
  entity_kind,
  categories_json,
  min_pool,
  entity_json,
  updated_at
)
SELECT
  id,
  name,
  aliases_json,
  entity_kind,
  categories_json,
  min_pool,
  entity_json,
  updated_at
FROM visual_clue_entities;

DROP TABLE visual_clue_entities;
ALTER TABLE visual_clue_entities_replacement RENAME TO visual_clue_entities;

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
