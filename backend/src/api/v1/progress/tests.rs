use super::*;
use axum::{
    body::Body,
    http::{HeaderValue, Request, header},
};
use tower::ServiceExt;
use uuid::Uuid;

async fn authenticated_headers(state: &AppState) -> HeaderMap {
    let user_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?)")
        .bind(&user_id)
        .bind(format!("{user_id}@example.com"))
        .bind(format!("{user_id}@example.com"))
        .bind(1_i64)
        .bind(0_i64)
        .bind(0_i64)
        .execute(&state.db)
        .await
        .unwrap();
    let token = crate::auth::create_session(&state.db, &user_id, now_millis())
        .await
        .unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_session={token}; aaidle_csrf=csrf")).unwrap(),
    );
    headers.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    headers.insert("x-aaidle-csrf-token", HeaderValue::from_static("csrf"));
    headers
}

async fn authenticated_bearer_headers(state: &AppState) -> HeaderMap {
    let session_headers = authenticated_headers(state).await;
    let user = crate::auth::user_for_session(
        &state.db,
        super::super::session_cookie(&session_headers),
        now_millis(),
    )
    .await
    .unwrap()
    .unwrap();
    let token = crate::auth::create_access_token(&user, &state.config, now_millis()).unwrap();
    HeaderMap::from_iter([(
        header::AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
    )])
}

fn sync_request() -> ProgressSyncRequest {
    serde_json::from_value(serde_json::json!({
        "version": 1,
        "playerId": Uuid::new_v4(),
        "preferences": {
            "hasSeenClassicHowToPlay": true,
            "innerCircleActive": false,
            "hellMode": false,
            "hasAutoplayedHardcoreSoundtrack": false
        },
        "activeGames": []
    }))
    .unwrap()
}

fn preferences_update() -> ProgressPreferencesUpdate {
    serde_json::from_value(serde_json::json!({
        "hasSeenClassicHowToPlay": false,
        "innerCircleActive": true,
        "hellMode": false,
        "hasAutoplayedHardcoreSoundtrack": true
    }))
    .unwrap()
}

#[tokio::test]
async fn progress_reads_require_authentication() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        get(State(state.clone()), HeaderMap::new()).await,
        Err(AppError::Unauthorized(_))
    ));
    assert!(matches!(
        history(
            State(state),
            HeaderMap::new(),
            Query(HistoryQuery {
                game: None,
                category: "llm".to_owned(),
                page: None,
            }),
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn progress_mutations_reject_missing_origin_before_payload_processing() {
    let state = super::super::test_support::state().await;
    let sync = serde_json::from_value(serde_json::json!({
        "version": 1,
        "playerId": Uuid::new_v4(),
        "preferences": {
            "hasSeenClassicHowToPlay": false,
            "innerCircleActive": false,
            "hellMode": false,
            "hasAutoplayedHardcoreSoundtrack": false
        },
        "activeGames": []
    }))
    .unwrap();
    assert!(matches!(
        put(State(state.clone()), HeaderMap::new(), Ok(Json(sync))).await,
        Err(AppError::Forbidden(_))
    ));
    let update = serde_json::from_value(serde_json::json!({
        "hasSeenClassicHowToPlay": false,
        "innerCircleActive": false,
        "hellMode": false,
        "hasAutoplayedHardcoreSoundtrack": false
    }))
    .unwrap();
    assert!(matches!(
        preferences(State(state), HeaderMap::new(), Ok(Json(update))).await,
        Err(AppError::Forbidden(_))
    ));
}

#[tokio::test]
async fn progress_sync_read_preferences_and_history_succeed() {
    let state = super::super::test_support::state().await;
    let headers = authenticated_headers(&state).await;
    let response = put(
        State(state.clone()),
        headers.clone(),
        Ok(Json(sync_request())),
    )
    .await
    .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");

    let (cache, Json(progress)) = get(State(state.clone()), headers.clone()).await.unwrap();
    assert_eq!(cache, [("cache-control", "no-store")]);
    assert!(progress.progress.is_some());
    assert_eq!(
        preferences(
            State(state.clone()),
            headers.clone(),
            Ok(Json(preferences_update())),
        )
        .await
        .unwrap(),
        StatusCode::NO_CONTENT
    );
    let (cache, Json(history_response)) = history(
        State(state),
        headers,
        Query(HistoryQuery {
            game: Some("timeline".to_owned()),
            category: "normal".to_owned(),
            page: Some(2),
        }),
    )
    .await
    .unwrap();
    assert_eq!(cache, [("cache-control", "no-store")]);
    assert_eq!(history_response.page, 2);
    assert!(history_response.games.is_empty());
}

#[tokio::test]
async fn progress_mutations_accept_bearer_auth_without_browser_security_headers() {
    let state = super::super::test_support::state().await;
    let headers = authenticated_bearer_headers(&state).await;

    assert_eq!(
        put(
            State(state.clone()),
            headers.clone(),
            Ok(Json(sync_request())),
        )
        .await
        .unwrap()
        .status(),
        StatusCode::OK
    );
    assert_eq!(
        preferences(State(state), headers, Ok(Json(preferences_update())),)
            .await
            .unwrap(),
        StatusCode::NO_CONTENT
    );
}

#[tokio::test]
async fn progress_sync_honors_return_minimal_preference() {
    let state = super::super::test_support::state().await;
    let mut headers = authenticated_headers(&state).await;
    headers.insert(
        "prefer",
        HeaderValue::from_static("respond-async, RETURN=MINIMAL"),
    );
    let response = put(State(state), headers, Ok(Json(sync_request())))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(response.headers()["preference-applied"], "return=minimal");
    assert_eq!(response.headers()["cache-control"], "no-store");
}

#[tokio::test]
async fn progress_security_checks_cover_csrf_and_missing_auth_after_origin() {
    let state = super::super::test_support::state().await;
    let headers = authenticated_headers(&state).await;
    let mut missing_csrf = headers.clone();
    missing_csrf.remove("x-aaidle-csrf-token");
    assert!(matches!(
        put(State(state.clone()), missing_csrf, Ok(Json(sync_request())),).await,
        Err(AppError::Forbidden(_))
    ));
    let mut no_session = HeaderMap::new();
    no_session.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    no_session.insert(header::COOKIE, HeaderValue::from_static("aaidle_csrf=csrf"));
    no_session.insert("x-aaidle-csrf-token", HeaderValue::from_static("csrf"));
    assert!(matches!(
        preferences(State(state), no_session, Ok(Json(preferences_update())),).await,
        Err(AppError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn progress_history_defaults_and_validation_errors_are_returned() {
    let state = super::super::test_support::state().await;
    let headers = authenticated_headers(&state).await;
    let (_, Json(defaults)) = history(
        State(state.clone()),
        headers.clone(),
        Query(HistoryQuery {
            game: None,
            category: "llm".to_owned(),
            page: None,
        }),
    )
    .await
    .unwrap();
    assert_eq!(defaults.page, 1);
    assert!(defaults.games.is_empty());
    assert!(matches!(
        history(
            State(state.clone()),
            headers.clone(),
            Query(HistoryQuery {
                game: Some("unknown".to_owned()),
                category: "llm".to_owned(),
                page: Some(1),
            }),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        history(
            State(state),
            headers,
            Query(HistoryQuery {
                game: Some("classic".to_owned()),
                category: "llm".to_owned(),
                page: Some(0),
            }),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn progress_prefer_header_covers_present_but_nonmatching_values() {
    let state = super::super::test_support::state().await;
    let mut headers = authenticated_headers(&state).await;
    headers.insert("prefer", HeaderValue::from_static("respond-async"));
    let response = put(State(state.clone()), headers, Ok(Json(sync_request())))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let mut invalid_headers = authenticated_headers(&state).await;
    invalid_headers.insert("prefer", HeaderValue::from_bytes(&[0xff]).unwrap());
    let response = put(State(state), invalid_headers, Ok(Json(sync_request())))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn progress_and_preference_rate_limits_are_enforced() {
    let state = super::super::test_support::state().await;
    let headers = authenticated_headers(&state).await;
    let user_id = sqlx::query_scalar::<_, String>("SELECT id FROM users LIMIT 1")
        .fetch_one(&state.db)
        .await
        .unwrap();
    let progress_subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "progress", &user_id).unwrap();
    for _ in 0..PROGRESS_WRITES_PER_MINUTE {
        assert!(
            crate::auth::consume_rate_limit(
                &state.db,
                "progress-sync",
                &progress_subject,
                PROGRESS_WRITES_PER_MINUTE,
                60_000,
                now_millis(),
            )
            .await
            .unwrap()
        );
    }
    assert!(matches!(
        put(State(state.clone()), headers, Ok(Json(sync_request())),).await,
        Err(AppError::TooManyRequests { .. })
    ));

    let preference_headers = authenticated_headers(&state).await;
    let preference_user =
        sqlx::query_scalar::<_, String>("SELECT id FROM users ORDER BY rowid DESC LIMIT 1")
            .fetch_one(&state.db)
            .await
            .unwrap();
    let preference_subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "preferences", &preference_user)
            .unwrap();
    for _ in 0..PREFERENCE_WRITES_PER_MINUTE {
        assert!(
            crate::auth::consume_rate_limit(
                &state.db,
                "progress-preferences",
                &preference_subject,
                PREFERENCE_WRITES_PER_MINUTE,
                60_000,
                now_millis(),
            )
            .await
            .unwrap()
        );
    }
    assert!(matches!(
        preferences(
            State(state),
            preference_headers,
            Ok(Json(preferences_update())),
        )
        .await,
        Err(AppError::TooManyRequests { .. })
    ));
}

#[tokio::test]
async fn progress_database_errors_propagate_after_authentication() {
    let get_state = super::super::test_support::state().await;
    let get_headers = authenticated_headers(&get_state).await;
    sqlx::query("DROP TABLE user_progress_profiles")
        .execute(&get_state.db)
        .await
        .unwrap();
    assert!(matches!(
        get(State(get_state), get_headers).await,
        Err(AppError::Database(_))
    ));

    let mutation_state = super::super::test_support::state().await;
    let put_headers = authenticated_headers(&mutation_state).await;
    sqlx::query("CREATE TRIGGER fail_rate_limit BEFORE INSERT ON request_rate_limits BEGIN SELECT RAISE(FAIL, 'test failure'); END")
        .execute(&mutation_state.db)
        .await
        .unwrap();
    assert!(matches!(
        put(
            State(mutation_state.clone()),
            put_headers,
            Ok(Json(sync_request())),
        )
        .await,
        Err(AppError::Database(_))
    ));
    let preference_headers = authenticated_headers(&mutation_state).await;
    assert!(matches!(
        preferences(
            State(mutation_state),
            preference_headers,
            Ok(Json(preferences_update())),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let history_state = super::super::test_support::state().await;
    let history_headers = authenticated_headers(&history_state).await;
    sqlx::query("DROP TABLE guess_events")
        .execute(&history_state.db)
        .await
        .unwrap();
    assert!(matches!(
        history(
            State(history_state),
            history_headers,
            Query(HistoryQuery {
                game: None,
                category: "llm".to_owned(),
                page: None,
            }),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn progress_update_and_post_sync_load_errors_are_exposed() {
    let preference_state = super::super::test_support::state().await;
    let preference_headers = authenticated_headers(&preference_state).await;
    sqlx::query("DROP TABLE user_progress_profiles")
        .execute(&preference_state.db)
        .await
        .unwrap();
    assert!(matches!(
        preferences(
            State(preference_state),
            preference_headers,
            Ok(Json(preferences_update())),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let headers = authenticated_headers(&state).await;
    put(
        State(state.clone()),
        headers.clone(),
        Ok(Json(sync_request())),
    )
    .await
    .unwrap();
    let (user_id, player_id) = sqlx::query_as::<_, (String, String)>(
        "SELECT user_id,primary_player_id FROM user_progress_profiles LIMIT 1",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();
    sqlx::query("INSERT INTO providers (id,name,slug,country_code,is_active,created_at,updated_at) VALUES ('progress-provider','Provider','progress-provider','US',1,0,0)")
        .execute(&state.db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO models (id,provider_id,name,slug,release_date,release_year,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES ('progress-model','progress-provider','Progress Model','progress-model','2024-01-01',2024,'unknown','unknown','active',1,'test','test',0,0)")
        .execute(&state.db)
        .await
        .unwrap();
    let challenge_id = Uuid::new_v4();
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) VALUES (?,'2025-01-01','classic:llm:normal','progress-model',1,0,'test')")
        .bind(challenge_id.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    sqlx::query("CREATE TRIGGER delete_profile_after_game_state AFTER INSERT ON user_game_states BEGIN DELETE FROM user_progress_profiles WHERE user_id = NEW.user_id; END")
        .execute(&state.db)
        .await
        .unwrap();
    let started_at = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap();
    let request = serde_json::from_value(serde_json::json!({
        "version": 1,
        "playerId": player_id,
        "preferences": {
            "hasSeenClassicHowToPlay": true,
            "innerCircleActive": false,
            "hellMode": false,
            "hasAutoplayedHardcoreSoundtrack": false
        },
        "activeGames": [{"challengeId": challenge_id, "startedAt": started_at}]
    }))
    .unwrap();
    assert!(matches!(
        put(State(state.clone()), headers, Ok(Json(request))).await,
        Err(AppError::Unavailable(_))
    ));
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_progress_profiles WHERE user_id = ?",
        )
        .bind(user_id)
        .fetch_one(&state.db)
        .await
        .unwrap(),
        0
    );
}

#[tokio::test]
async fn malformed_progress_payloads_reach_both_json_rejection_branches() {
    let state = super::super::test_support::state().await;
    let headers = authenticated_headers(&state).await;
    for (method, uri, body, expected) in [
        (
            "PUT",
            "/auth/progress",
            "{".to_owned(),
            StatusCode::BAD_REQUEST,
        ),
        (
            "PATCH",
            "/auth/progress/preferences",
            "{".to_owned(),
            StatusCode::BAD_REQUEST,
        ),
        (
            "PUT",
            "/auth/progress",
            "x".repeat(17 * 1024),
            StatusCode::PAYLOAD_TOO_LARGE,
        ),
        (
            "PATCH",
            "/auth/progress/preferences",
            "x".repeat(17 * 1024),
            StatusCode::PAYLOAD_TOO_LARGE,
        ),
    ] {
        let request = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ORIGIN, "http://localhost:3000")
            .header(header::COOKIE, headers[header::COOKIE].clone())
            .header("x-aaidle-csrf-token", "csrf")
            .body(Body::from(body))
            .unwrap();
        let response = super::super::router(state.clone())
            .oneshot(request)
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
}
