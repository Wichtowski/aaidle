DELETE FROM daily_challenges AS canonical
WHERE canonical.mode LIKE 'classic:od:%'
  AND EXISTS (
    SELECT 1
    FROM daily_challenges AS legacy
    WHERE legacy.challenge_date = canonical.challenge_date
      AND canonical.mode = REPLACE(legacy.mode, 'classic:object-detection:', 'classic:od:')
  );

UPDATE daily_challenges
SET mode = REPLACE(mode, 'classic:object-detection:', 'classic:od:')
WHERE mode LIKE 'classic:object-detection:%';

DELETE FROM daily_challenges AS canonical
WHERE canonical.mode LIKE 'classic:filters:%'
  AND EXISTS (
    SELECT 1
    FROM daily_challenges AS legacy
    WHERE legacy.challenge_date = canonical.challenge_date
      AND canonical.mode = REPLACE(legacy.mode, 'classic:image-processing:', 'classic:filters:')
  );

UPDATE daily_challenges
SET mode = REPLACE(mode, 'classic:image-processing:', 'classic:filters:')
WHERE mode LIKE 'classic:image-processing:%';
