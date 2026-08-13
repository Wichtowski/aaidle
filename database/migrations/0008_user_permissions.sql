ALTER TABLE users ADD COLUMN permission TEXT NOT NULL DEFAULT 'user'
CHECK (permission IN ('user', 'developer', 'superadmin'));
