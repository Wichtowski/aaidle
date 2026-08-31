use std::time::Duration;

use sqlx::Row;

use super::*;
use crate::config::{AppConfig, AppEnvironment};

fn config(database_url: &str) -> AppConfig {
    AppConfig {
        environment: AppEnvironment::Local,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        database_url: database_url.to_owned(),
        daily_selection_secret: "daily-selection-secret-1234567890".to_owned(),
        request_timeout: Duration::from_secs(1),
        app_origin: "http://localhost:5173".to_owned(),
        secure_cookies: false,
        auth_secret: "authentication-secret-123456789012".to_owned(),
        health_key: "health-check-secret-1234567890123".to_owned(),
        release_version: "test".to_owned(),
        github_oauth: None,
        github_issues_token: None,
        google_oauth: None,
        resend_api_key: None,
    }
}

#[tokio::test]
async fn connect_rejects_invalid_sqlite_options() {
    let error = connect(&config("sqlite://database?mode=invalid"))
        .await
        .expect_err("invalid SQLite option should fail");
    assert!(matches!(error, crate::error::AppError::Config(_)));
    assert!(error.to_string().contains("valid SQLite URL"));
}

#[tokio::test]
async fn connect_propagates_connection_errors() {
    let error = connect(&config("postgres://localhost/database"))
        .await
        .expect_err("unusable SQLite path should fail");
    assert!(matches!(error, crate::error::AppError::Database(_)));
}

#[tokio::test]
async fn connect_creates_a_usable_sqlite_pool() {
    let pool = connect(&config("sqlite::memory:"))
        .await
        .expect("SQLite pool");
    let value: i64 = sqlx::query("SELECT 7 AS value")
        .fetch_one(&pool)
        .await
        .expect("query")
        .get("value");
    assert_eq!(value, 7);
    assert_eq!(pool.options().get_max_connections(), DB_MAX_CONNECTIONS);
    pool.close().await;
}

#[test]
fn latest_migration_version_handles_empty_and_embedded_migration_sets() {
    assert_eq!(latest_migration_version(&[]), 0);
    assert_eq!(
        latest_migration_version(&sqlx::migrate!("./migrations").migrations),
        sqlx::migrate!("./migrations")
            .migrations
            .last()
            .expect("embedded migration")
            .version
    );
}

#[tokio::test]
async fn migrate_applies_embedded_migrations_and_returns_latest_version() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("pool");

    let version = migrate(&pool).await.expect("migrations");
    let applied: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(&pool)
        .await
        .expect("migration version");

    assert_eq!(version, applied);
    assert!(version > 0);
    sqlx::query(
        "INSERT INTO users (id, email, email_normalized, created_at, updated_at) VALUES ('default-limit', 'default@example.com', 'default@example.com', 1, 1)",
    )
    .execute(&pool)
    .await
    .expect("insert user with default report limit");
    let issue_report_limit: i64 =
        sqlx::query_scalar("SELECT issue_report_limit FROM users WHERE id = 'default-limit'")
            .fetch_one(&pool)
            .await
            .expect("default report limit");
    assert_eq!(issue_report_limit, 2);
    sqlx::query("UPDATE users SET issue_report_limit = 0 WHERE id = 'default-limit'")
        .execute(&pool)
        .await
        .expect("zero report limit");
    pool.close().await;
}

#[tokio::test]
async fn migrate_reports_migration_errors_and_restores_foreign_keys() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("pool");
    migrate(&pool).await.expect("initial migrations");
    sqlx::query("UPDATE _sqlx_migrations SET checksum = X'00' WHERE version = 1")
        .execute(&pool)
        .await
        .expect("corrupt migration checksum");

    let error = migrate(&pool)
        .await
        .expect_err("checksum mismatch should fail");
    let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(&pool)
        .await
        .expect("foreign key setting");

    assert!(matches!(error, crate::error::AppError::Config(_)));
    assert!(error.to_string().contains("database migration failed"));
    assert_eq!(foreign_keys, 1);
}

#[tokio::test]
async fn migrate_propagates_pool_acquisition_errors() {
    let pool = SqlitePoolOptions::new()
        .connect_lazy("sqlite::memory:")
        .expect("lazy pool");
    pool.close().await;

    let error = migrate(&pool).await.expect_err("closed pool should fail");
    assert!(matches!(error, crate::error::AppError::Database(_)));
}
