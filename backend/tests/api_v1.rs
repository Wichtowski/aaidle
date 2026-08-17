use std::{path::PathBuf, sync::Arc, time::Duration};

use aidle_api::{
    api, auth,
    config::{AppConfig, AppEnvironment},
    db, repository,
    state::AppState,
};
use axum::{
    Extension,
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use tower::ServiceExt;
use uuid::Uuid;

async fn test_app() -> (axum::Router, SqlitePool) {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect test database");
    db::migrate(&pool).await.expect("migrate test database");
    seed(&pool).await;
    let config = Arc::new(AppConfig {
        environment: AppEnvironment::Local,
        bind_addr: "127.0.0.1:0".parse().expect("socket address"),
        database_url: "sqlite::memory:".to_owned(),
        daily_selection_secret: "test secret that is longer than thirty two bytes".to_owned(),
        request_timeout: Duration::from_secs(10),
        app_origin: "http://localhost:3000".to_owned(),
        secure_cookies: false,
        auth_secret: "test secret that is longer than thirty two bytes".to_owned(),
        health_key: "test health key that is longer than thirty two bytes".to_owned(),
        release_version: "v1.2.3".to_owned(),
        github_oauth: None,
        github_issues_token: None,
        google_oauth: None,
        resend_api_key: None,
    });
    (
        api::router(AppState::new(pool.clone(), config).expect("app state")).layer(Extension(
            ConnectInfo(
                "127.0.0.1:0"
                    .parse::<std::net::SocketAddr>()
                    .expect("test peer address"),
            ),
        )),
        pool,
    )
}

async fn production_style_test_pool() -> (SqlitePool, PathBuf) {
    let path = std::env::temp_dir().join(format!("aidle-api-test-{}.db", Uuid::new_v4()));
    let config = AppConfig {
        environment: AppEnvironment::Local,
        bind_addr: "127.0.0.1:0".parse().expect("socket address"),
        database_url: format!("sqlite://{}", path.display()),
        daily_selection_secret: "test secret that is longer than thirty two bytes".to_owned(),
        request_timeout: Duration::from_secs(10),
        app_origin: "http://localhost:3000".to_owned(),
        secure_cookies: false,
        auth_secret: "test secret that is longer than thirty two bytes".to_owned(),
        health_key: "test health key that is longer than thirty two bytes".to_owned(),
        release_version: "v1.2.3".to_owned(),
        github_oauth: None,
        github_issues_token: None,
        google_oauth: None,
        resend_api_key: None,
    };
    let pool = db::connect(&config)
        .await
        .expect("connect production-style database");
    db::migrate(&pool)
        .await
        .expect("migrate production-style database");
    seed(&pool).await;
    (pool, path)
}

async fn remove_test_database(pool: SqlitePool, path: PathBuf) {
    pool.close().await;
    for suffix in ["", "-wal", "-shm"] {
        let candidate = format!("{}{}", path.display(), suffix);
        if std::path::Path::new(&candidate).exists() {
            std::fs::remove_file(&candidate).expect("remove test database file");
        }
    }
}

async fn seed(pool: &SqlitePool) {
    sqlx::query(
        "INSERT INTO providers (id, name, slug, country_code, is_active, created_at, updated_at) \
         VALUES ('openai', 'OpenAI', 'openai', 'US', 1, 0, 0)",
    )
    .execute(pool)
    .await
    .expect("seed provider");
    for (id, name, year) in [
        ("model-one", "Model One", 2024),
        ("model-two", "Model Two", 2025),
    ] {
        sqlx::query(
            "INSERT INTO models (id, provider_id, name, slug, release_year, local_execution, reasoning_support, \
             status, is_guessable, verified_at, source_label, created_at, updated_at) \
             VALUES (?, 'openai', ?, ?, ?, 'unknown', 'unknown', 'active', 1, 'test', 'test', 0, 0)",
        )
        .bind(id)
        .bind(name)
        .bind(id)
        .bind(year)
        .execute(pool)
        .await
        .expect("seed model");
    }
    sqlx::query(
        "INSERT INTO categories (id, name, slug) VALUES \
         ('language-model', 'language model', 'language-model'), ('filters', 'filters', 'filters')",
    )
    .execute(pool)
    .await
    .expect("seed categories");
    sqlx::query(
        "INSERT INTO model_categories (model_id, category_id) VALUES \
         ('model-one', 'language-model'), ('model-two', 'filters')",
    )
    .execute(pool)
    .await
    .expect("seed model categories");
    sqlx::query(
        "INSERT INTO model_game_metadata (model_id, min_pool_rank, category_details_json, updated_at) VALUES \
         ('model-one', 0, '{}', 0), ('model-two', 1, '{}', 0)",
    )
    .execute(pool)
    .await
    .expect("seed game metadata");
    sqlx::query(
        "INSERT INTO model_families (id, provider_id, name, slug, created_at, updated_at) \
         VALUES ('openai-gpt', 'openai', 'GPT', 'gpt', 0, 0)",
    )
    .execute(pool)
    .await
    .expect("seed family");
    sqlx::query("UPDATE models SET family_id = 'openai-gpt' WHERE id = 'model-one'")
        .execute(pool)
        .await
        .expect("attach family");
    for number in 3..=6 {
        let id = format!("model-{number}");
        sqlx::query(
            "INSERT INTO models (id, provider_id, name, slug, release_year, local_execution, reasoning_support, \
             status, is_guessable, verified_at, source_label, created_at, updated_at) \
             VALUES (?, 'openai', ?, ?, 2025, 'unknown', 'unknown', 'active', 1, 'test', 'test', 0, 0)",
        )
        .bind(&id)
        .bind(format!("Model {number}"))
        .bind(&id)
        .execute(pool)
        .await
        .expect("seed additional model");
    }
}

async fn response_json(response: axum::response::Response) -> serde_json::Value {
    let body = response
        .into_body()
        .collect()
        .await
        .expect("read response body")
        .to_bytes();
    serde_json::from_slice(&body).expect("decode JSON response")
}

fn cookie_value(response: &axum::response::Response, name: &str) -> String {
    response
        .headers()
        .get_all("set-cookie")
        .iter()
        .find_map(|value| value.to_str().ok()?.strip_prefix(&format!("{name}=")))
        .and_then(|value| value.split(';').next())
        .expect("cookie value")
        .to_owned()
}

fn current_millis() -> i64 {
    time::OffsetDateTime::now_utc()
        .unix_timestamp_nanos()
        .div_euclid(1_000_000) as i64
}

#[tokio::test]
async fn routes_are_versioned_and_hide_the_answer() {
    let (app, _) = test_app().await;
    let missing_health_key = app
        .clone()
        .oneshot(
            Request::get("/api/v1/health")
                .body(Body::empty())
                .expect("health request"),
        )
        .await
        .expect("health response");
    assert_eq!(missing_health_key.status(), StatusCode::UNAUTHORIZED);
    assert!(
        missing_health_key
            .into_body()
            .collect()
            .await
            .expect("read unauthorized response")
            .to_bytes()
            .is_empty()
    );

    let invalid_health_key = app
        .clone()
        .oneshot(
            Request::get("/api/v1/health")
                .header("x-aaidle-health-key", "invalid health key")
                .body(Body::empty())
                .expect("health request"),
        )
        .await
        .expect("health response");
    assert_eq!(invalid_health_key.status(), StatusCode::UNAUTHORIZED);
    assert!(
        invalid_health_key
            .into_body()
            .collect()
            .await
            .expect("read unauthorized response")
            .to_bytes()
            .is_empty()
    );

    let health = app
        .clone()
        .oneshot(
            Request::get("/api/v1/health")
                .header(
                    "x-aaidle-health-key",
                    "test health key that is longer than thirty two bytes",
                )
                .body(Body::empty())
                .expect("health request"),
        )
        .await
        .expect("health response");
    assert_eq!(health.status(), StatusCode::OK);
    let health = response_json(health).await;
    assert_eq!(health["apiVersion"], "v1");
    assert_eq!(health["version"], "v1.2.3");

    let ready = app
        .clone()
        .oneshot(
            Request::get("/api/v1/health/ready")
                .header(
                    "x-aaidle-health-key",
                    "test health key that is longer than thirty two bytes",
                )
                .body(Body::empty())
                .expect("readiness request"),
        )
        .await
        .expect("readiness response");
    assert_eq!(ready.status(), StatusCode::OK);

    let models = app
        .clone()
        .oneshot(
            Request::get("/api/v1/models")
                .body(Body::empty())
                .expect("models request"),
        )
        .await
        .expect("models response");
    assert_eq!(models.status(), StatusCode::OK);
    assert_eq!(
        response_json(models).await["models"]
            .as_array()
            .expect("models array")
            .len(),
        6
    );

    let classic = app
        .oneshot(
            Request::get("/api/v1/games/classic/llm/normal")
                .body(Body::empty())
                .expect("Classic request"),
        )
        .await
        .expect("Classic response");
    assert_eq!(classic.status(), StatusCode::OK);
    let challenge = response_json(classic).await["challenge"].clone();
    assert!(challenge.get("answerModelId").is_none());
    assert!(challenge.get("answer_model_id").is_none());
}

#[test]
fn classic_category_set_matches_the_legacy_domain() {
    let categories = repository::ClassicCategory::ALL
        .into_iter()
        .map(repository::ClassicCategory::path_segment)
        .collect::<Vec<_>>();
    assert_eq!(
        categories,
        vec![
            "llm",
            "cv",
            "nlp",
            "od",
            "classical-ml",
            "filters",
            "hardcore",
        ]
    );
}

#[tokio::test]
async fn password_accounts_use_same_origin_sessions_and_are_readable_by_me() {
    let (app, _) = test_app().await;
    let register = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/register")
                .header("origin", "http://localhost:3000")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "email": "Person@Example.test",
                        "password": "correct horse battery staple"
                    })
                    .to_string(),
                ))
                .expect("register request"),
        )
        .await
        .expect("register response");
    assert_eq!(register.status(), StatusCode::ACCEPTED);
    assert_eq!(response_json(register).await["accepted"], true);

    let login = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/password")
                .header("origin", "http://localhost:3000")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "email": "person@example.test",
                        "password": "correct horse battery staple"
                    })
                    .to_string(),
                ))
                .expect("login request"),
        )
        .await
        .expect("login response");
    assert_eq!(login.status(), StatusCode::OK);
    let session = login
        .headers()
        .get("set-cookie")
        .expect("session cookie")
        .to_str()
        .expect("cookie text")
        .split(';')
        .next()
        .expect("cookie pair")
        .to_owned();
    assert_eq!(
        response_json(login).await["user"]["email"],
        "person@example.test"
    );

    let me = app
        .clone()
        .oneshot(
            Request::get("/api/v1/auth/me")
                .header("cookie", &session)
                .body(Body::empty())
                .expect("me request"),
        )
        .await
        .expect("me response");
    assert_eq!(me.status(), StatusCode::OK);
    assert_eq!(
        response_json(me).await["user"]["email"],
        "person@example.test"
    );

    let logout = app
        .oneshot(
            Request::post("/api/v1/auth/logout")
                .header("origin", "http://localhost:3000")
                .header("cookie", session)
                .body(Body::empty())
                .expect("logout request"),
        )
        .await
        .expect("logout response");
    assert_eq!(logout.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn auth_email_tokens_are_single_use_and_account_deletion_revokes_sessions() {
    let (app, pool) = test_app().await;
    let email = "tokens@example.test";
    let registration = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/register")
                .header("origin", "http://localhost:3000")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "email": email,
                        "password": "correct horse battery staple"
                    })
                    .to_string(),
                ))
                .expect("registration request"),
        )
        .await
        .expect("registration response");
    let registration = response_json(registration).await;
    let activation_url = registration["activationUrl"]
        .as_str()
        .expect("local activation URL");
    let activation_path = activation_url
        .strip_prefix("http://localhost:3000")
        .expect("application origin");
    let verification = app
        .clone()
        .oneshot(
            Request::get(activation_path)
                .body(Body::empty())
                .expect("verification request"),
        )
        .await
        .expect("verification response");
    assert_eq!(verification.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        verification.headers()["location"],
        "http://localhost:3000/login?activated=1"
    );

    let login = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/password")
                .header("origin", "http://localhost:3000")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "email": email,
                        "password": "correct horse battery staple"
                    })
                    .to_string(),
                ))
                .expect("login request"),
        )
        .await
        .expect("login response");
    assert_eq!(login.status(), StatusCode::OK);
    let old_session = cookie_value(&login, "aaidle_session");
    let user_id =
        sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE email_normalized = ?")
            .bind(email)
            .fetch_one(&pool)
            .await
            .expect("user ID");

    let (_, reset_token) = auth::create_password_reset_token(&pool, email, current_millis())
        .await
        .expect("reset token")
        .expect("registered account");
    let reset = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/password-reset/complete")
                .header("origin", "http://localhost:3000")
                .header("cookie", format!("aaidle_password_reset={reset_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"password": "another correct battery staple"}).to_string(),
                ))
                .expect("password reset request"),
        )
        .await
        .expect("password reset response");
    assert_eq!(reset.status(), StatusCode::OK);
    let reset_session = cookie_value(&reset, "aaidle_session");
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_sessions WHERE user_id = ?")
            .bind(&user_id)
            .fetch_one(&pool)
            .await
            .expect("session count"),
        1
    );
    let replay = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/password-reset/complete")
                .header("origin", "http://localhost:3000")
                .header("cookie", format!("aaidle_password_reset={reset_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"password": "third correct battery staple"}).to_string(),
                ))
                .expect("replayed password reset request"),
        )
        .await
        .expect("replayed password reset response");
    assert_eq!(replay.status(), StatusCode::BAD_REQUEST);

    let deletion_token = auth::create_account_deletion_token(&pool, &user_id, current_millis())
        .await
        .expect("deletion token");
    let deletion = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/account-deletion/complete")
                .header("origin", "http://localhost:3000")
                .header(
                    "cookie",
                    format!(
                        "aaidle_account_deletion={deletion_token}; aaidle_session={reset_session}"
                    ),
                )
                .body(Body::empty())
                .expect("account deletion request"),
        )
        .await
        .expect("account deletion response");
    assert_eq!(deletion.status(), StatusCode::NO_CONTENT);
    let me = app
        .oneshot(
            Request::get("/api/v1/auth/me")
                .header("cookie", format!("aaidle_session={old_session}"))
                .body(Body::empty())
                .expect("me request"),
        )
        .await
        .expect("me response");
    assert!(response_json(me).await["user"].is_null());
}

#[tokio::test]
async fn account_progress_merges_verified_completions_without_granting_hardcore() {
    let (app, pool) = test_app().await;
    let email = "progress@example.test";
    let register = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/register")
                .header("origin", "http://localhost:3000")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"email": email, "password": "correct horse battery staple"})
                        .to_string(),
                ))
                .expect("register request"),
        )
        .await
        .expect("register response");
    assert_eq!(register.status(), StatusCode::ACCEPTED);
    let login = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/password")
                .header("origin", "http://localhost:3000")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"email": email, "password": "correct horse battery staple"})
                        .to_string(),
                ))
                .expect("login request"),
        )
        .await
        .expect("login response");
    let session = cookie_value(&login, "aaidle_session");
    let classic = app
        .clone()
        .oneshot(
            Request::get("/api/v1/games/classic/llm/normal")
                .body(Body::empty())
                .expect("classic game request"),
        )
        .await
        .expect("classic game response");
    let challenge_id = response_json(classic).await["challenge"]["id"]
        .as_str()
        .expect("challenge ID")
        .to_owned();
    let player_id = Uuid::new_v4();
    let request_id = Uuid::new_v4();
    let progress = serde_json::json!({
        "version": 1,
        "playerId": player_id,
        "activeMode": "classic",
        "games": {
            "classic:llm:normal:today": {
                "challengeId": challenge_id,
                "challengeDate": "2026-08-16",
                "mode": "classic:llm:normal",
                "status": "solved",
                "guesses": [{"requestId": request_id, "attemptedAt": "2026-08-16T12:00:00.000Z", "isCorrect": true}],
                "startedAt": "2026-08-16T11:00:00.000Z",
                "completedAt": "2026-08-16T12:00:00.000Z"
            }
        },
        "stats": {"classic": {"currentStreak": 0, "bestStreak": 0, "gamesPlayed": 0, "gamesWon": 0, "lastPlayedDate": null, "lastSolvedDate": null, "guessDistribution": {}}},
        "preferences": {"reducedMotion": false, "highContrast": false, "hasSeenClassicPrivacy": false, "hardcoreUnlocked": true, "innerCircleActive": false, "hellMode": false, "hasAutoplayedHardcoreSoundtrack": false}
    });
    let forged_sync = app
        .clone()
        .oneshot(
            Request::put("/api/v1/auth/progress")
                .header("origin", "http://localhost:3000")
                .header("cookie", format!("aaidle_session={session}"))
                .header("content-type", "application/json")
                .body(Body::from(progress.to_string()))
                .expect("forged progress request"),
        )
        .await
        .expect("forged progress response");
    assert_eq!(forged_sync.status(), StatusCode::OK);
    let user_id =
        sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE email_normalized = ?")
            .bind(email)
            .fetch_one(&pool)
            .await
            .expect("user ID");
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_challenge_completions WHERE user_id = ?"
        )
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .expect("completion count"),
        0
    );
    assert!(
        !auth::has_hardcore_access(&pool, &user_id)
            .await
            .expect("hardcore access")
    );
    let answer_model_id = sqlx::query_scalar::<_, String>(
        "SELECT answer_model_id FROM daily_challenges WHERE id = ?",
    )
    .bind(&challenge_id)
    .fetch_one(&pool)
    .await
    .expect("challenge answer");
    let accepted_guess = app
        .clone()
        .oneshot(
            Request::post(format!(
                "/api/v1/games/classic/challenges/{challenge_id}/guesses"
            ))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "playerId": player_id,
                    "requestId": request_id,
                    "guessedModelId": answer_model_id,
                    "attemptNumber": 1
                })
                .to_string(),
            ))
            .expect("guess request"),
        )
        .await
        .expect("guess response");
    assert_eq!(accepted_guess.status(), StatusCode::OK);
    let synced = app
        .clone()
        .oneshot(
            Request::put("/api/v1/auth/progress")
                .header("origin", "http://localhost:3000")
                .header("cookie", format!("aaidle_session={session}"))
                .header("content-type", "application/json")
                .body(Body::from(progress.to_string()))
                .expect("progress request"),
        )
        .await
        .expect("progress response");
    let synced = response_json(synced).await;
    assert_eq!(synced["progress"]["stats"]["classic"]["gamesPlayed"], 1);
    assert_eq!(synced["progress"]["stats"]["classic"]["gamesWon"], 1);
    assert!(
        !auth::has_hardcore_access(&pool, &user_id)
            .await
            .expect("hardcore access")
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_challenge_completions WHERE user_id = ?"
        )
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .expect("completion count"),
        1
    );
    let loaded = app
        .oneshot(
            Request::get("/api/v1/auth/progress")
                .header("cookie", format!("aaidle_session={session}"))
                .body(Body::empty())
                .expect("progress load request"),
        )
        .await
        .expect("progress load response");
    assert_eq!(
        response_json(loaded).await["progress"]["playerId"],
        player_id.to_string()
    );
}

#[tokio::test]
async fn admin_permissions_and_soundtrack_are_enforced_server_side() {
    let (app, pool) = test_app().await;
    let normal = auth::register_with_password(
        &pool,
        "normal-admin-test@example.test",
        "correct horse battery staple",
        current_millis(),
    )
    .await
    .expect("normal user");
    let normal_session = auth::create_session(&pool, &normal.id, current_millis())
        .await
        .expect("normal session");
    let anonymous = app
        .clone()
        .oneshot(
            Request::get("/api/v1/admin/users")
                .body(Body::empty())
                .expect("anonymous request"),
        )
        .await
        .expect("anonymous response");
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);
    let forbidden = app
        .clone()
        .oneshot(
            Request::get("/api/v1/admin/users")
                .header("cookie", format!("aaidle_session={normal_session}"))
                .body(Body::empty())
                .expect("normal request"),
        )
        .await
        .expect("normal response");
    assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);

    sqlx::query("UPDATE users SET permission = 'developer' WHERE id = ?")
        .bind(&normal.id)
        .execute(&pool)
        .await
        .expect("promote developer");
    let allowed = app
        .clone()
        .oneshot(
            Request::get("/api/v1/admin/users?query=normal-admin-test")
                .header("cookie", format!("aaidle_session={normal_session}"))
                .body(Body::empty())
                .expect("developer request"),
        )
        .await
        .expect("developer response");
    assert_eq!(allowed.status(), StatusCode::OK);
    assert_eq!(response_json(allowed).await["total"], 1);

    sqlx::query("UPDATE users SET disabled_at = ? WHERE id = ?")
        .bind(current_millis())
        .bind(&normal.id)
        .execute(&pool)
        .await
        .expect("disable developer");
    let disabled = app
        .clone()
        .oneshot(
            Request::get("/api/v1/admin/users")
                .header("cookie", format!("aaidle_session={normal_session}"))
                .body(Body::empty())
                .expect("disabled request"),
        )
        .await
        .expect("disabled response");
    assert_eq!(disabled.status(), StatusCode::FORBIDDEN);

    let superadmin = auth::register_with_password(
        &pool,
        "superadmin@example.test",
        "correct horse battery staple",
        current_millis(),
    )
    .await
    .expect("superadmin user");
    sqlx::query("UPDATE users SET permission = 'superadmin' WHERE id = ?")
        .bind(&superadmin.id)
        .execute(&pool)
        .await
        .expect("promote superadmin");
    let superadmin_session = auth::create_session(&pool, &superadmin.id, current_millis())
        .await
        .expect("superadmin session");
    let updated = app
        .clone()
        .oneshot(
            Request::put("/api/v1/admin/settings/hardcore-soundtrack")
                .header("origin", "http://localhost:3000")
                .header("cookie", format!("aaidle_session={superadmin_session}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"url": "https://soundcloud.com/example/track"}).to_string(),
                ))
                .expect("soundtrack update"),
        )
        .await
        .expect("soundtrack response");
    assert_eq!(updated.status(), StatusCode::OK);
    let public = app
        .oneshot(
            Request::get("/api/v1/public-config")
                .body(Body::empty())
                .expect("public config request"),
        )
        .await
        .expect("public config response");
    assert_eq!(
        response_json(public).await["hardcoreSoundtrackUrl"],
        "https://soundcloud.com/example/track"
    );
}

#[tokio::test]
async fn trajectory_requires_a_solve_and_accepts_only_a_bound_token() {
    let (app, _) = test_app().await;
    let game = app
        .clone()
        .oneshot(
            Request::get("/api/v1/games/classic/llm/normal")
                .body(Body::empty())
                .expect("classic game request"),
        )
        .await
        .expect("classic game response");
    let game = response_json(game).await;
    let challenge_id = game["challenge"]["id"].as_str().expect("challenge ID");
    let locked = app
        .clone()
        .oneshot(
            Request::post(format!(
                "/api/v1/games/classic/challenges/{challenge_id}/trajectory"
            ))
            .header("origin", "http://localhost:3000")
            .header("content-type", "application/json")
            .body(Body::from("{}"))
            .expect("locked trajectory request"),
        )
        .await
        .expect("locked trajectory response");
    assert_eq!(locked.status(), StatusCode::FORBIDDEN);
    let solved = app
        .clone()
        .oneshot(
            Request::post(format!("/api/v1/games/classic/challenges/{challenge_id}/guesses"))
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"playerId": Uuid::new_v4(), "requestId": Uuid::new_v4(), "guessedModelId": "model-one", "attemptNumber": 1}).to_string(),
                ))
                .expect("correct guess request"),
        )
        .await
        .expect("correct guess response");
    let solved = response_json(solved).await;
    assert_eq!(solved["isCorrect"], true);
    let token = solved["trajectoryAccessToken"]
        .as_str()
        .expect("trajectory token");
    let trajectory = app
        .clone()
        .oneshot(
            Request::post(format!(
                "/api/v1/games/classic/challenges/{challenge_id}/trajectory"
            ))
            .header("origin", "http://localhost:3000")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({"trajectoryAccessToken": token}).to_string(),
            ))
            .expect("trajectory request"),
        )
        .await
        .expect("trajectory response");
    assert_eq!(trajectory.status(), StatusCode::OK);
    let wrong_challenge = app
        .oneshot(
            Request::post(format!(
                "/api/v1/games/classic/challenges/{}/trajectory",
                Uuid::new_v4()
            ))
            .header("origin", "http://localhost:3000")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({"trajectoryAccessToken": token}).to_string(),
            ))
            .expect("wrong trajectory request"),
        )
        .await
        .expect("wrong trajectory response");
    assert_ne!(wrong_challenge.status(), StatusCode::OK);
}

#[tokio::test]
async fn hardcore_ritual_uses_six_distinct_current_challenge_completions() {
    let (app, pool) = test_app().await;
    let user = auth::register_with_password(
        &pool,
        "hardcore@example.test",
        "correct horse battery staple",
        current_millis(),
    )
    .await
    .expect("user");
    let session = auth::create_session(&pool, &user.id, current_millis())
        .await
        .expect("session");
    let locked = app
        .clone()
        .oneshot(
            Request::post("/api/v1/games/classic/hardcore/access")
                .header("origin", "http://localhost:3000")
                .header("cookie", format!("aaidle_session={session}"))
                .body(Body::empty())
                .expect("locked access request"),
        )
        .await
        .expect("locked access response");
    assert_eq!(locked.status(), StatusCode::FORBIDDEN);
    let date = time::OffsetDateTime::now_utc().date().to_string();
    for mode in [
        "classic:llm:challenge",
        "classic:cv:challenge",
        "classic:nlp:challenge",
        "classic:od:challenge",
        "classic:classical-ml:challenge",
        "classic:filters:challenge",
    ] {
        let challenge_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO daily_challenges (id, challenge_date, mode, answer_model_id, selection_version, generated_at, generation_source) VALUES (?, ?, ?, 'model-one', 1, 0, 'test')")
            .bind(&challenge_id)
            .bind(&date)
            .bind(mode)
            .execute(&pool)
            .await
            .expect("challenge");
        let category = mode
            .strip_prefix("classic:")
            .and_then(|value| value.strip_suffix(":challenge"))
            .expect("classic challenge category");
        sqlx::query("INSERT INTO user_game_progress (user_id, game_type, difficulty, category, completed_at) VALUES (?, 'classic', 'challenge', ?, ?)")
            .bind(&user.id)
            .bind(category)
            .bind(current_millis())
            .execute(&pool)
            .await
            .expect("completion");
    }
    let first = app.clone().oneshot(
        Request::post("/api/v1/games/classic/hardcore/access")
            .header("origin", "http://localhost:3000")
            .header("cookie", format!("aaidle_session={session}"))
            .body(Body::empty())
            .expect("first access request"),
    );
    let second = app.oneshot(
        Request::post("/api/v1/games/classic/hardcore/access")
            .header("origin", "http://localhost:3000")
            .header("cookie", format!("aaidle_session={session}"))
            .body(Body::empty())
            .expect("second access request"),
    );
    let (first, second) = tokio::join!(first, second);
    assert_eq!(first.expect("first response").status(), StatusCode::OK);
    assert_eq!(second.expect("second response").status(), StatusCode::OK);
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_unlocks WHERE user_id = ? AND unlock_key = 'hardcore-mode'"
        )
        .bind(&user.id)
        .fetch_one(&pool)
        .await
        .expect("grant count"),
        1
    );
}

#[tokio::test]
async fn guesses_are_idempotent_and_stats_are_aggregated() {
    let (app, _) = test_app().await;
    let game = app
        .clone()
        .oneshot(
            Request::get("/api/v1/games/classic/llm/normal")
                .body(Body::empty())
                .expect("Classic request"),
        )
        .await
        .expect("Classic response");
    let game = response_json(game).await;
    let challenge_id = game["challenge"]["id"]
        .as_str()
        .expect("challenge id")
        .to_owned();
    let player_id = Uuid::new_v4();
    let request_id = Uuid::new_v4();
    let body = serde_json::json!({
        "playerId": player_id,
        "requestId": request_id,
        "guessedModelId": "model-one",
        "attemptNumber": 1
    })
    .to_string();
    let request = || {
        Request::post(format!(
            "/api/v1/games/classic/challenges/{challenge_id}/guesses"
        ))
        .header("content-type", "application/json")
        .body(Body::from(body.clone()))
        .expect("guess request")
    };
    let first = app.clone().oneshot(request()).await.expect("first guess");
    assert_eq!(first.status(), StatusCode::OK);
    let first = response_json(first).await;
    assert_eq!(first["playerStats"]["gamesPlayed"], 1);
    let comparison_keys = first["comparison"]
        .as_object()
        .expect("comparison object")
        .keys()
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();
    let columns = game["columns"]
        .as_array()
        .expect("columns")
        .iter()
        .map(|value| value.as_str().expect("column").to_owned())
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(comparison_keys, columns);
    assert!(
        !first["comparison"]
            .as_object()
            .expect("comparison")
            .contains_key("kernelBased")
    );
    let replay = app
        .clone()
        .oneshot(request())
        .await
        .expect("replayed guess");
    assert_eq!(replay.status(), StatusCode::OK);
    assert_eq!(response_json(replay).await["playerStats"]["gamesPlayed"], 1);

    let duplicate = app
        .clone()
        .oneshot(
            Request::post(format!(
                "/api/v1/games/classic/challenges/{challenge_id}/guesses"
            ))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "playerId": player_id,
                    "requestId": Uuid::new_v4(),
                    "guessedModelId": "model-one",
                    "attemptNumber": 2
                })
                .to_string(),
            ))
            .expect("duplicate request"),
        )
        .await
        .expect("duplicate response");
    assert_eq!(duplicate.status(), StatusCode::CONFLICT);
    assert_eq!(
        response_json(duplicate).await["error"]["code"],
        "DUPLICATE_GUESS"
    );

    let stats = app
        .oneshot(
            Request::get(format!(
                "/api/v1/games/classic/challenges/{challenge_id}/stats"
            ))
            .body(Body::empty())
            .expect("stats request"),
        )
        .await
        .expect("stats response");
    assert_eq!(stats.status(), StatusCode::OK);
    let stats = response_json(stats).await;
    assert_eq!(stats["totalGuesses"], 1);
    assert!(stats.get("guessedModelId").is_none());
}

#[tokio::test]
async fn classic_category_route_scopes_the_model_pool_and_rejects_outside_guesses() {
    let (app, _) = test_app().await;
    let game = app
        .clone()
        .oneshot(
            Request::get("/api/v1/games/classic/llm/normal")
                .body(Body::empty())
                .expect("classic game request"),
        )
        .await
        .expect("classic game response");
    assert_eq!(game.status(), StatusCode::OK);
    let game = response_json(game).await;
    assert_eq!(game["challenge"]["mode"], "classic:llm:normal");
    assert_eq!(game["models"].as_array().expect("classic models").len(), 1);
    assert_eq!(game["columns"][0], "provider");
    let challenge_id = game["challenge"]["id"].as_str().expect("challenge ID");
    let response = app
        .oneshot(
            Request::post(format!(
                "/api/v1/games/classic/challenges/{challenge_id}/guesses"
            ))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "playerId": Uuid::new_v4(),
                    "requestId": Uuid::new_v4(),
                    "guessedModelId": "model-two",
                    "attemptNumber": 1
                })
                .to_string(),
            ))
            .expect("outside pool guess"),
        )
        .await
        .expect("outside pool response");
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        response_json(response).await["error"]["message"],
        "This model is not available in this Classic difficulty."
    );
}

#[tokio::test]
async fn oversized_guess_bodies_are_rejected() {
    let (app, _) = test_app().await;
    let response = app
        .oneshot(
            Request::post(format!(
                "/api/v1/games/classic/challenges/{}/guesses",
                Uuid::new_v4()
            ))
            .header("content-type", "application/json")
            .body(Body::from(vec![b'x'; 16 * 1024 + 1]))
            .expect("oversized request"),
        )
        .await
        .expect("oversized response");
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn daily_creation_is_safe_when_called_concurrently() {
    let (_, pool) = test_app().await;
    let mut tasks = Vec::with_capacity(8);
    for _ in 0..8 {
        let pool = pool.clone();
        tasks.push(tokio::spawn(async move {
            repository::ensure_daily_challenge(
                &pool,
                "2026-08-15",
                "classic",
                "test secret that is longer than thirty two bytes",
                60,
            )
            .await
            .expect("create challenge")
            .id
        }));
    }
    let mut ids = Vec::with_capacity(tasks.len());
    for task in tasks {
        ids.push(task.await.expect("task result"));
    }
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn sqlite_wal_pool_handles_concurrent_daily_creation_and_guess_writes() {
    let (pool, path) = production_style_test_pool().await;
    let challenge = repository::ensure_daily_challenge(
        &pool,
        "2026-08-15",
        "classic",
        "test secret that is longer than thirty two bytes",
        60,
    )
    .await
    .expect("create challenge");
    let challenge_id = Uuid::parse_str(&challenge.id).expect("challenge UUID");
    let mut tasks = Vec::with_capacity(24);
    for _ in 0..24 {
        let pool = pool.clone();
        tasks.push(tokio::spawn(async move {
            repository::process_guess(
                &pool,
                repository::GuessInput {
                    challenge_id,
                    player_id: Uuid::new_v4(),
                    request_id: Uuid::new_v4(),
                    guessed_model_id: "model-one".to_owned(),
                    attempt_number: 1,
                },
            )
            .await
        }));
    }
    for task in tasks {
        task.await
            .expect("concurrent task should not panic")
            .expect("concurrent write should not be locked or lost");
    }
    let stats = repository::challenge_stats(&pool, challenge_id)
        .await
        .expect("read aggregate stats");
    assert_eq!(stats.total_guesses, 24);
    assert_eq!(stats.unique_players, 24);
    remove_test_database(pool, path).await;
}
