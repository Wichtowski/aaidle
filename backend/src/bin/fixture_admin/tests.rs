use aidle_api::config::AppEnvironment;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

use super::*;

fn config(environment: AppEnvironment, database_url: &str) -> Arc<AppConfig> {
    Arc::new(AppConfig {
        environment,
        bind_addr: "127.0.0.1:0".parse().expect("address"),
        database_url: database_url.to_owned(),
        daily_selection_secret: "daily-selection-secret-1234567890".to_owned(),
        request_timeout: std::time::Duration::from_secs(1),
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

#[tokio::test]
async fn fixture_is_rejected_only_in_production() {
    validate_environment(AppEnvironment::Local).expect("local fixture is allowed");
    let error = run(config(AppEnvironment::Production, "sqlite::memory:"))
        .await
        .expect_err("production fixture must be rejected");
    assert!(
        matches!(error, AppError::Config(message) if message.contains("cannot be provisioned"))
    );
}

#[test]
fn classic_modes_map_to_seed_categories() {
    assert_eq!(classic_category("classic:llm:normal"), Some("llm"));
    assert_eq!(
        classic_category("classic:od:normal"),
        Some("object-detection")
    );
    assert_eq!(classic_category("classic:llm:hardcore"), None);
    assert_eq!(classic_category("timeline:llm:normal"), None);
}

#[test]
fn alternate_model_skips_the_answer_and_preserves_order() {
    let models = vec!["answer".to_owned(), "first".to_owned(), "second".to_owned()];
    assert_eq!(
        alternate_model_id(&models, "answer").as_deref(),
        Some("first")
    );
    assert_eq!(
        alternate_model_id(&models, "missing").as_deref(),
        Some("answer")
    );
    assert_eq!(alternate_model_id(&["answer".to_owned()], "answer"), None);
}

#[tokio::test]
async fn provision_propagates_early_database_failures() {
    let empty = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("empty pool");
    assert!(matches!(provision(empty).await, Err(AppError::Database(_))));

    for table in [
        "anonymous_players",
        "user_player_links",
        "user_progress_profiles",
        "site_settings",
        "daily_challenges",
        "models",
    ] {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("fixture pool");
        db::migrate(&pool).await.expect("migrations");
        sqlx::query(&format!("DROP TABLE {table}"))
            .execute(&pool)
            .await
            .expect("drop fixture table");
        assert!(matches!(provision(pool).await, Err(AppError::Database(_))));
    }
}

#[tokio::test]
async fn provision_is_idempotent_for_fixture_records() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("test pool");
    sqlx::raw_sql(
            "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, email_normalized TEXT UNIQUE, password_hash TEXT, email_verified_at INTEGER, permission TEXT, created_at INTEGER, updated_at INTEGER, disabled_at INTEGER, disabled_reason TEXT, disabled_by_user_id TEXT); \
             CREATE TABLE anonymous_players (id TEXT PRIMARY KEY, created_at INTEGER, last_seen_at INTEGER); \
             CREATE TABLE user_player_links (user_id TEXT, player_id TEXT, linked_at INTEGER, UNIQUE(user_id, player_id)); \
             CREATE TABLE user_progress_profiles (user_id TEXT PRIMARY KEY, primary_player_id TEXT, has_seen_classic_privacy INTEGER, has_seen_classic_how_to_play INTEGER, inner_circle_active INTEGER, updated_at INTEGER); \
             CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER); \
             CREATE TABLE daily_challenges (id TEXT, mode TEXT, answer_model_id TEXT, challenge_date TEXT); \
             CREATE TABLE models (id TEXT, is_guessable INTEGER, status TEXT); \
             CREATE TABLE guess_events (challenge_id TEXT, player_id TEXT, is_correct INTEGER, user_id TEXT, created_at INTEGER); \
             CREATE TABLE user_challenge_completions (user_id TEXT, challenge_id TEXT, completed_at INTEGER, UNIQUE(user_id, challenge_id)); \
             CREATE TABLE user_game_progress (user_id TEXT, game_type TEXT, difficulty TEXT, category TEXT, completed_at INTEGER, UNIQUE(user_id, game_type, difficulty, category)); \
             CREATE TABLE user_unlocks (user_id TEXT, unlock_key TEXT, unlocked_at INTEGER, UNIQUE(user_id, unlock_key));",
        )
        .execute(&pool)
        .await
        .expect("fixture schema");
    sqlx::query(
            "INSERT INTO daily_challenges (id, mode, answer_model_id, challenge_date) VALUES (?, 'classic:llm:challenge', 'answer', '2026-01-01')",
        )
        .bind("00000000-0000-4000-8000-000000000002")
        .execute(&pool)
        .await
        .expect("challenge");
    sqlx::query(
            "INSERT INTO guess_events (challenge_id, player_id, is_correct, created_at) VALUES (?, ?, 1, 1)",
        )
        .bind("00000000-0000-4000-8000-000000000002")
        .bind(PLAYER_ID)
        .execute(&pool)
        .await
        .expect("correct guess");

    provision(pool.clone()).await.expect("first provision");
    provision(pool.clone()).await.expect("second provision");

    let (permission, disabled_at): (String, Option<i64>) =
        sqlx::query_as("SELECT permission, disabled_at FROM users WHERE email_normalized = ?")
            .bind(EMAIL)
            .fetch_one(&pool)
            .await
            .expect("fixture user");
    assert_eq!(permission, "superadmin");
    assert_eq!(disabled_at, None);
    let player_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM user_player_links WHERE player_id = ?")
            .bind(PLAYER_ID)
            .fetch_one(&pool)
            .await
            .expect("player links");
    assert_eq!(player_count, 1);
    let soundtrack: String =
        sqlx::query_scalar("SELECT value FROM site_settings WHERE key = 'hardcore_soundcloud_url'")
            .fetch_one(&pool)
            .await
            .expect("soundtrack setting");
    assert_eq!(soundtrack, HARDCORE_SOUNDTRACK_URL);
}

#[tokio::test]
async fn provision_adds_wrong_and_correct_guesses_for_unsolved_challenges() {
    let path = std::env::temp_dir().join(format!("fixture-admin-{}.db", Uuid::new_v4()));
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true),
        )
        .await
        .expect("test pool");
    db::migrate(&pool).await.expect("migrations");
    sqlx::raw_sql(
            "INSERT INTO providers (id, name, slug, country_code, is_active, created_at, updated_at) VALUES ('provider', 'Provider', 'provider', 'US', 1, 0, 0); \
             INSERT INTO models (id, provider_id, name, slug, release_date, release_year, local_execution, reasoning_support, status, is_guessable, verified_at, source_label, created_at, updated_at) VALUES ('model-one', 'provider', 'Model One', 'model-one', '2024-01-01', 2024, 'unknown', 'unknown', 'active', 1, 'test', 'test', 0, 0), ('model-two', 'provider', 'Model Two', 'model-two', '2025-01-01', 2025, 'unknown', 'unknown', 'active', 1, 'test', 'test', 0, 0); \
             INSERT INTO categories (id, name, slug) VALUES ('object-detection', 'object detection', 'object-detection'); \
             INSERT INTO model_categories (model_id, category_id) VALUES ('model-one', 'object-detection'), ('model-two', 'object-detection'); \
             INSERT INTO model_game_metadata (model_id, min_pool_rank, category_details_json, updated_at) VALUES ('model-one', 0, '{}', 0), ('model-two', 0, '{}', 0); \
             INSERT INTO daily_challenges (id, challenge_date, mode, answer_model_id, selection_version, generated_at, generation_source) VALUES ('00000000-0000-4000-8000-000000000010', '2026-01-01', 'classic:od:normal', 'model-one', 1, 0, 'test'), ('00000000-0000-4000-8000-000000000011', '2026-01-01', 'classic:od:challenge', 'model-one', 1, 0, 'test'), ('00000000-0000-4000-8000-000000000012', '2026-01-02', 'classic:od:normal', 'model-one', 1, 0, 'test'); \
             INSERT INTO anonymous_players (id, created_at, last_seen_at) VALUES ('00000000-0000-4000-8000-000000000001', 0, 0); \
             INSERT INTO guess_events (id, request_id, challenge_id, player_id, guessed_model_id, attempt_number, is_correct, comparison_json, created_at) VALUES ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'model-two', 1, 0, '{}', 0);",
        )
        .execute(&pool)
        .await
        .expect("challenge data");

    provision(pool.clone()).await.expect("provision fixture");

    for challenge_id in [
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000011",
        "00000000-0000-4000-8000-000000000012",
    ] {
        let guesses: (i64, i64) = sqlx::query_as(
                "SELECT COUNT(*), SUM(is_correct) FROM guess_events WHERE challenge_id = ? AND player_id = ?",
            )
            .bind(challenge_id)
            .bind(PLAYER_ID)
            .fetch_one(&pool)
            .await
            .expect("fixture guesses");
        assert_eq!(guesses, (2, 1));
    }

    sqlx::query("DROP TABLE guess_events")
        .execute(&pool)
        .await
        .expect("drop guess events");
    assert!(matches!(
        provision(pool.clone()).await,
        Err(AppError::Database(_))
    ));

    pool.close().await;
    for suffix in ["", "-wal", "-shm"] {
        let candidate = format!("{}{}", path.display(), suffix);
        if std::path::Path::new(&candidate).exists() {
            std::fs::remove_file(candidate).expect("remove fixture database");
        }
    }
}
