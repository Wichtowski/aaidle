ALTER TABLE auth_rate_limits RENAME TO request_rate_limits;

CREATE INDEX request_rate_limits_window_started_idx
  ON request_rate_limits(window_started_at);
