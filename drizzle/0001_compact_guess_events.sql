-- Model names and their full comparison payloads are derived from the catalog at read time.
-- Keep only the compact result fields needed for idempotent guess responses.
UPDATE guess_events
SET comparison_json = json_remove(comparison_json, '$.guess.model')
WHERE json_valid(comparison_json);
