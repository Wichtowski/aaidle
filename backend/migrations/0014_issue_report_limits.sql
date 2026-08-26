ALTER TABLE users ADD COLUMN issue_report_limit INTEGER NOT NULL DEFAULT 3 CHECK(issue_report_limit >= 3 AND issue_report_limit <= 1000);
