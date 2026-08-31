use aidle_api::error::AppError;

use super::*;

const TEST_SCHEMA: &str = "CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT, slug TEXT, country_code TEXT, is_active INTEGER, created_at INTEGER, updated_at INTEGER); \
     CREATE TABLE model_families (id TEXT PRIMARY KEY, provider_id TEXT, name TEXT, slug TEXT, created_at INTEGER, updated_at INTEGER); \
     CREATE TABLE models (id TEXT PRIMARY KEY, provider_id TEXT, family_id TEXT, family_tokens_json TEXT, name TEXT, slug TEXT, release_date TEXT, release_year INTEGER, context_window_tokens INTEGER, open_weights INTEGER, local_execution TEXT, reasoning_support TEXT, status TEXT, is_guessable INTEGER, verified_at TEXT, source_label TEXT, created_at INTEGER, updated_at INTEGER); \
     CREATE TABLE model_game_metadata (model_id TEXT PRIMARY KEY, min_pool_rank INTEGER, country TEXT, weight_availability TEXT, category_details_json TEXT, updated_at INTEGER); \
     CREATE TABLE model_aliases (id TEXT PRIMARY KEY, model_id TEXT, alias TEXT, normalized_alias TEXT, UNIQUE(model_id, normalized_alias)); \
     CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, slug TEXT); \
     CREATE TABLE model_categories (model_id TEXT, category_id TEXT, UNIQUE(model_id, category_id)); \
     CREATE TABLE modalities (id TEXT PRIMARY KEY, name TEXT, slug TEXT); \
     CREATE TABLE model_input_modalities (model_id TEXT, modality_id TEXT, UNIQUE(model_id, modality_id)); \
     CREATE TABLE model_output_modalities (model_id TEXT, modality_id TEXT, UNIQUE(model_id, modality_id)); \
     CREATE TABLE use_cases (id TEXT PRIMARY KEY, name TEXT, slug TEXT); \
     CREATE TABLE model_use_cases (model_id TEXT, use_case_id TEXT, UNIQUE(model_id, use_case_id)); \
     CREATE TABLE timeline_items (id TEXT PRIMARY KEY, item_kind TEXT, model_id TEXT, name TEXT, provider_key TEXT, categories_json TEXT, min_pool_rank INTEGER, release_date TEXT, year_annotation TEXT, source_url TEXT, is_active INTEGER, updated_at INTEGER); \
     CREATE TABLE visual_clue_entities (id TEXT PRIMARY KEY, name TEXT, aliases_json TEXT, entity_kind TEXT, categories_json TEXT, min_pool INTEGER, entity_json TEXT, updated_at INTEGER);";

fn config(database_url: &str) -> Arc<AppConfig> {
    Arc::new(AppConfig {
        environment: aidle_api::config::AppEnvironment::Local,
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

async fn seed_pool() -> sqlx::SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("test pool");
    sqlx::raw_sql(TEST_SCHEMA)
        .execute(&pool)
        .await
        .expect("seed schema");
    pool
}

fn timeline_item(kind: &str, release_date: &str) -> SeedTimelineItem {
    SeedTimelineItem {
        id: "item-id".to_owned(),
        kind: kind.to_owned(),
        name: "Item".to_owned(),
        min_pool: 0,
        provider: "Provider".to_owned(),
        categories: vec![],
        release_date: release_date.to_owned(),
        year_annotation: None,
        source_url: None,
        active: true,
    }
}

#[test]
fn release_dates_accept_years_and_real_calendar_dates() {
    for valid in ["0001", "2024", "2024-02-29"] {
        assert!(valid_release_date(valid), "{valid} should be valid");
    }
    for invalid in [
        "1",
        "999",
        "0000",
        "year",
        "2023-02-29",
        "2024-13-01",
        "2024-01-32",
    ] {
        assert!(!valid_release_date(invalid), "{invalid} should be invalid");
    }
}

#[test]
fn timeline_validation_reports_date_before_kind() {
    validate_timeline_item(&timeline_item("model", "2024")).expect("valid model");
    validate_timeline_item(&timeline_item("event", "2024-01-31")).expect("valid event");

    let date_error =
        validate_timeline_item(&timeline_item("invalid", "0000")).expect_err("invalid date");
    assert!(
        matches!(date_error, AppError::Config(message) if message.contains("invalid release date"))
    );
    let kind_error =
        validate_timeline_item(&timeline_item("invalid", "2024")).expect_err("invalid kind");
    assert!(matches!(kind_error, AppError::Config(message) if message.contains("invalid kind")));
}

#[test]
fn timeline_active_defaults_true_and_canonical_seeds_validate() {
    let item: SeedTimelineItem = serde_json::from_str(
        r#"{"id":"event","kind":"event","name":"Event","minPool":0,"provider":"Org","categories":[],"releaseDate":"2024"}"#,
    )
    .expect("timeline item");
    assert!(item.active);

    let models: Vec<SeedModel> = serde_json::from_str(MODELS).expect("Classic seed");
    assert!(!models.is_empty());
    let timeline: Vec<SeedTimelineItem> =
        serde_json::from_str(TIMELINE_MODELS).expect("Timeline seed");
    assert!(!timeline.is_empty());
    for item in &timeline {
        validate_timeline_item(item).expect("valid canonical timeline item");
    }
}

#[tokio::test]
async fn run_propagates_connection_failures() {
    let error = run(config("postgres://localhost/database"))
        .await
        .expect_err("unsupported database URL");
    assert!(matches!(error, AppError::Config(_) | AppError::Database(_)));
}

#[tokio::test]
async fn seed_loads_canonical_catalogs_and_can_be_repeated() {
    let pool = seed_pool().await;
    let expected_models: Vec<SeedModel> = serde_json::from_str(MODELS).expect("Classic seed");
    let expected_timeline: Vec<SeedTimelineItem> =
        serde_json::from_str(TIMELINE_MODELS).expect("Timeline seed");
    let expected_emoji: Vec<aidle_api::domain::emoji::VisualClueEntity> =
        serde_json::from_str(EMOJI).expect("Emoji seed");

    seed(pool.clone()).await.expect("first seed");
    seed(pool.clone()).await.expect("second seed");

    let model_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM models")
        .fetch_one(&pool)
        .await
        .expect("model count");
    let timeline_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM timeline_items")
        .fetch_one(&pool)
        .await
        .expect("timeline count");
    let emoji_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM visual_clue_entities")
        .fetch_one(&pool)
        .await
        .expect("emoji count");
    assert_eq!(model_count as usize, expected_models.len());
    assert_eq!(timeline_count as usize, expected_timeline.len());
    assert_eq!(emoji_count as usize, expected_emoji.len());
}

#[tokio::test]
async fn seed_model_handles_absent_optional_metadata() {
    let pool = seed_pool().await;
    let model = SeedModel {
        id: "minimal-model".to_owned(),
        name: "Minimal".to_owned(),
        min_pool: None,
        provider: None,
        country: None,
        family: vec![],
        categories: vec![],
        input_modalities: None,
        output_modalities: None,
        use_cases: None,
        reasoning_support: None,
        weight_availability: None,
        release_date: Some("unknown".to_owned()),
        context_window_tokens: None,
        aliases: None,
        category_details: serde_json::Value::Null,
    };
    let mut connection = pool.acquire().await.expect("connection");

    seed_model(&mut connection, &model, 7)
        .await
        .expect("minimal model");
    drop(connection);

    let stored: (String, Option<String>, Option<i64>, String) = sqlx::query_as(
        "SELECT provider_id, family_id, release_year, reasoning_support FROM models WHERE id = 'minimal-model'",
    )
    .fetch_one(&pool)
    .await
    .expect("stored model");
    assert_eq!(
        stored,
        ("unknown".to_owned(), None, None, "unknown".to_owned())
    );
}

#[tokio::test]
async fn seed_data_reports_each_json_stage_and_rolls_back_changes() {
    let lazy_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .connect_lazy("sqlite::memory:")
        .expect("lazy pool");
    assert!(matches!(
        seed_data(lazy_pool, "{", "[]", "[]").await,
        Err(AppError::Json(_))
    ));

    let invalid_timeline_json = seed_pool().await;
    assert!(matches!(
        seed_data(invalid_timeline_json, "[]", "{", "[]").await,
        Err(AppError::Json(_))
    ));

    let invalid_emoji_json = seed_pool().await;
    sqlx::query(
        "INSERT INTO timeline_items (id, item_kind, name, provider_key, categories_json, min_pool_rank, release_date, is_active, updated_at) VALUES ('sentinel', 'event', 'Sentinel', 'test', '[]', 0, '2024', 1, 0)",
    )
    .execute(&invalid_emoji_json)
    .await
    .expect("sentinel timeline item");
    assert!(matches!(
        seed_data(invalid_emoji_json.clone(), "[]", "[]", "{").await,
        Err(AppError::Json(_))
    ));
    let sentinel_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM timeline_items WHERE id = 'sentinel'")
            .fetch_one(&invalid_emoji_json)
            .await
            .expect("sentinel count");
    assert_eq!(sentinel_count, 1);
}

#[tokio::test]
async fn seed_data_rejects_invalid_timeline_items_without_committing() {
    for (kind, release_date, expected) in [
        ("event", "0000", "invalid release date"),
        ("invalid", "2024", "invalid kind"),
    ] {
        let pool = seed_pool().await;
        let timeline_json = format!(
            r#"[{{"id":"bad","kind":"{kind}","name":"Bad","minPool":0,"provider":"Org","categories":[],"releaseDate":"{release_date}"}}]"#
        );
        let error = seed_data(pool.clone(), "[]", &timeline_json, "[]")
            .await
            .expect_err("invalid timeline item");
        assert!(matches!(error, AppError::Config(message) if message.contains(expected)));
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM timeline_items")
            .fetch_one(&pool)
            .await
            .expect("timeline count");
        assert_eq!(count, 0);
    }
}

#[tokio::test]
async fn seed_data_propagates_transaction_and_database_stage_errors() {
    let closed = seed_pool().await;
    closed.close().await;
    assert!(matches!(
        seed_data(closed, "[]", "[]", "[]").await,
        Err(AppError::Database(_))
    ));

    let empty = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("test pool");
    assert!(matches!(
        seed_data(
            empty,
            r#"[{"id":"model","name":"Model","family":[],"categories":[]}]"#,
            "[]",
            "[]",
        )
        .await,
        Err(AppError::Database(_))
    ));

    let missing_timeline_table = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("test pool");
    assert!(matches!(
        seed_data(missing_timeline_table, "[]", "[]", "[]").await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn seed_data_propagates_semantic_emoji_validation_errors() {
    let pool = seed_pool().await;
    let invalid = r#"[{
        "id":"bad", "name":"Bad", "entityKind":"technology",
        "categories":["hardware"], "minPool":1,
        "variants":[{"id":"bad", "weight":1, "initialRevealCount":3,
          "visuals":[{"type":"image", "src":"outside.webp"}]}]
    }]"#;

    assert!(matches!(
        seed_data(pool, "[]", "[]", invalid).await,
        Err(AppError::Config(_))
    ));
}

#[test]
fn slugs_normalize_case_and_separator_runs() {
    assert_eq!(slug("  GPT--4 / Turbo  "), "gpt-4-turbo");
    assert_eq!(slug("ABC123"), "abc123");
    assert_eq!(slug("Élan"), "lan");
    assert_eq!(slug("---"), "");
}

#[test]
fn country_codes_cover_known_and_unknown_values() {
    assert_eq!(country_code(Some("United States")), "US");
    assert_eq!(country_code(Some("Canada")), "CA");
    assert_eq!(country_code(Some("China")), "CN");
    assert_eq!(country_code(Some("France")), "FR");
    assert_eq!(country_code(Some("Poland")), "PL");
    assert_eq!(country_code(Some("Unknown")), "UN");
    assert_eq!(country_code(None), "UN");
}

#[test]
fn relationship_queries_accept_only_supported_combinations() {
    for combination in [
        ("categories", "model_categories", "category_id"),
        ("modalities", "model_input_modalities", "modality_id"),
        ("modalities", "model_output_modalities", "modality_id"),
        ("use_cases", "model_use_cases", "use_case_id"),
    ] {
        relationship_queries(combination.0, combination.1, combination.2)
            .expect("supported relationship");
    }
    let error = relationship_queries("categories", "model_categories", "modality_id")
        .expect_err("mismatched columns must fail");
    assert!(matches!(error, AppError::Config(message) if message == "invalid seed relationship"));
}
