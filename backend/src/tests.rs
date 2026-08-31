use std::time::Duration;

use aidle_api::config::AppEnvironment;
use sqlx::sqlite::SqlitePoolOptions;

use super::*;

fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

#[test]
fn migrate_command_is_only_selected_by_the_first_argument() {
    assert!(migrate_only(args(&["aidle-api", "migrate"])));
    assert!(migrate_only(args(&["aidle-api", "migrate", "ignored"])));
    assert!(!migrate_only(args(&["aidle-api"])));
    assert!(!migrate_only(args(&["aidle-api", "serve", "migrate"])));
    assert!(!migrate_only(Vec::new()));
}

fn config(bind_addr: SocketAddr) -> Arc<AppConfig> {
    Arc::new(AppConfig {
        environment: AppEnvironment::Local,
        bind_addr,
        database_url: "sqlite::memory:".to_owned(),
        daily_selection_secret: "daily-selection-secret-1234567890".to_owned(),
        request_timeout: Duration::from_secs(1),
        app_origin: "http://localhost:5173".to_owned(),
        secure_cookies: false,
        auth_secret: "local-auth-secret-1234567890".to_owned(),
        health_key: "local-health-key-1234567890".to_owned(),
        release_version: "test".to_owned(),
        github_oauth: None,
        github_issues_token: None,
        google_oauth: None,
        resend_api_key: None,
    })
}

#[test]
fn rate_limit_cutoff_uses_saturating_retention_arithmetic() {
    const DAY_MILLIS: i64 = 24 * 60 * 60 * 1_000;

    assert_eq!(
        rate_limit_retention_cutoff(2 * i128::from(DAY_MILLIS)),
        DAY_MILLIS
    );
    assert_eq!(rate_limit_retention_cutoff(0), -DAY_MILLIS);
    assert_eq!(rate_limit_retention_cutoff(i128::from(i64::MIN)), i64::MIN);
    assert_eq!(
        rate_limit_retention_cutoff(i128::from(i64::MAX) + 1),
        i64::MAX - DAY_MILLIS
    );
}

#[tokio::test]
async fn run_covers_migration_only_and_server_workflows() {
    for migrate_only in [true, false] {
        let path = std::env::temp_dir().join(format!("aidle-main-{}.db", uuid::Uuid::new_v4()));
        let mut app_config = config("127.0.0.1:0".parse().expect("address"));
        Arc::get_mut(&mut app_config)
            .expect("unshared config")
            .database_url = format!("sqlite://{}", path.display());

        run(app_config, migrate_only, async {})
            .await
            .expect("application workflow");
        for suffix in ["", "-wal", "-shm"] {
            let candidate = format!("{}{}", path.display(), suffix);
            if std::path::Path::new(&candidate).exists() {
                std::fs::remove_file(candidate).expect("remove test database");
            }
        }
    }
}

#[tokio::test]
async fn run_rejects_an_invalid_database_url() {
    let mut app_config = config("127.0.0.1:0".parse().expect("address"));
    Arc::get_mut(&mut app_config)
        .expect("unshared config")
        .database_url = "postgres://localhost/database".to_owned();
    let error = run(app_config, false, async {})
        .await
        .expect_err("invalid database URL");
    assert!(matches!(error, AppError::Config(_) | AppError::Database(_)));
}

#[tokio::test]
async fn serve_starts_and_stops_with_an_injected_shutdown() {
    let pool = SqlitePoolOptions::new()
        .connect_lazy("sqlite::memory:")
        .expect("lazy pool");

    serve(
        config("127.0.0.1:0".parse().expect("address")),
        pool,
        async {},
    )
    .await
    .expect("server shutdown");
}

#[tokio::test]
async fn serve_maps_listener_bind_errors() {
    let occupied = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("occupied listener");
    let pool = SqlitePoolOptions::new()
        .connect_lazy("sqlite::memory:")
        .expect("lazy pool");
    let error = serve(
        config(occupied.local_addr().expect("occupied address")),
        pool,
        std::future::pending(),
    )
    .await
    .expect_err("duplicate listener must fail");

    assert!(matches!(error, AppError::Config(message) if message.contains("failed to bind")));
}

#[tokio::test]
async fn maintenance_loop_purges_immediately_and_can_be_cancelled() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("pool");
    sqlx::query(
        "CREATE TABLE request_rate_limits (scope TEXT, subject_hash TEXT, window_started_at INTEGER)",
    )
    .execute(&pool)
    .await
    .expect("rate limit table");
    sqlx::query(
        "INSERT INTO request_rate_limits (scope, subject_hash, window_started_at) VALUES ('a', 'b', 0)",
    )
    .execute(&pool)
    .await
    .expect("rate limit row");

    let maintenance = tokio::spawn(purge_expired_rate_limits(pool.clone()));
    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM request_rate_limits")
                .fetch_one(&pool)
                .await
                .expect("rate limit count");
            if count == 0 {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("maintenance purge");
    maintenance.abort();
}

#[tokio::test]
async fn shutdown_selection_and_logging_cover_both_signal_paths() {
    let ctrl_c = select_shutdown(async { Ok(()) }, std::future::pending()).await;
    assert_eq!(ctrl_c, ShutdownCause::CtrlC);
    log_shutdown(ctrl_c);

    let terminate = select_shutdown(std::future::pending(), async { Some(()) }).await;
    assert_eq!(terminate, ShutdownCause::Terminate);
    log_shutdown(terminate);

    let handler_failure = tokio::spawn(select_shutdown(
        async { Err(std::io::Error::other("handler failed")) },
        std::future::pending(),
    ))
    .await;
    assert!(
        handler_failure
            .expect_err("handler failure must panic")
            .is_panic()
    );
}

#[tokio::test]
async fn purge_once_handles_removed_empty_and_database_error_results() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("pool");
    sqlx::query(
        "CREATE TABLE request_rate_limits (scope TEXT, subject_hash TEXT, window_started_at INTEGER)",
    )
    .execute(&pool)
    .await
    .expect("rate limit table");
    sqlx::query(
        "INSERT INTO request_rate_limits (scope, subject_hash, window_started_at) VALUES ('a', 'b', 10)",
    )
    .execute(&pool)
    .await
    .expect("rate limit row");

    purge_expired_rate_limits_once(&pool, 11).await;
    purge_expired_rate_limits_once(&pool, 11).await;
    sqlx::query("DROP TABLE request_rate_limits")
        .execute(&pool)
        .await
        .expect("drop rate limit table");
    purge_expired_rate_limits_once(&pool, 11).await;
}
