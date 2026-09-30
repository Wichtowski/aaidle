use super::*;
use crate::{
    api::v1::{now_millis, router, test_support},
    repository::assists::tests::{fixture, timeline_fixture},
};
use axum::{
    Extension,
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode, header},
};
use tower::ServiceExt;
use uuid::Uuid;

#[test]
fn compact_calendar_dates_and_launch_range_are_strict() {
    for value in [
        "abc",
        "20261301",
        "20260230",
        "202608111",
        "2026-08-11",
        "20260229",
        "２０２６０８１１",
    ] {
        assert!(parse_compact_date(value).is_err());
    }
    assert_eq!(parse_compact_date("20260811").unwrap(), FIRST_GAME_DATE);
    assert_eq!(
        parse_compact_date("20280229").unwrap(),
        date!(2028 - 02 - 29)
    );
    assert!(validate_range(FIRST_GAME_DATE, date!(2026 - 09 - 30)).is_ok());
    assert!(validate_range(date!(2026 - 08 - 10), date!(2026 - 09 - 30)).is_err());
    assert!(validate_range(date!(2026 - 10 - 01), date!(2026 - 09 - 30)).is_err());
    assert!(validate_range(date!(2026 - 09 - 30), date!(2026 - 09 - 30)).is_ok());
}

async fn setup() -> (AppState, String, Uuid) {
    let (pool, _, player) = fixture().await;
    let state = test_support::state_with_pool(pool);
    sqlx::query("INSERT INTO categories (id,name,slug) VALUES ('computer-vision','Computer vision','computer-vision')").execute(&state.db).await.unwrap();
    sqlx::query("INSERT INTO model_categories (model_id,category_id) SELECT id,'computer-vision' FROM models").execute(&state.db).await.unwrap();
    for entity in state.emoji.eligible(2) {
        sqlx::query("INSERT INTO visual_clue_entities (id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES (?,?,?,?,?,?,?,0)")
            .bind(&entity.id).bind(&entity.name).bind(serde_json::to_string(&entity.aliases).unwrap()).bind(entity.entity_kind.as_str()).bind(serde_json::to_string(&entity.categories).unwrap()).bind(i64::from(entity.min_pool)).bind(serde_json::to_string(entity).unwrap()).execute(&state.db).await.unwrap();
    }
    for i in 0..24 {
        sqlx::query("INSERT INTO timeline_items (id,item_kind,name,provider_key,categories_json,min_pool_rank,release_date,is_active,updated_at) VALUES (?,'event',?,'p','[\"llm\"]',0,?,1,0)")
            .bind(format!("event-{i}")).bind(format!("Event {i}")).bind(format!("{}-01-01",2000+i)).execute(&state.db).await.unwrap();
    }
    sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES ('user','history@example.test','history@example.test',0,0)").execute(&state.db).await.unwrap();
    crate::progress::canonical_player_id(&state.db, "user", player, now_millis())
        .await
        .unwrap();
    let session = crate::auth::create_session(&state.db, "user", now_millis())
        .await
        .unwrap();
    let timeline = timeline_fixture(
        &state.db,
        crate::domain::timeline::TimelineDifficulty::Normal,
    )
    .await;
    sqlx::query("UPDATE timeline_challenges SET challenge_date='2026-08-11' WHERE id=?")
        .bind(timeline.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    (state, session, player)
}

async fn read(
    state: &AppState,
    path: &str,
    session: Option<&str>,
) -> (StatusCode, serde_json::Value) {
    let mut request = Request::builder().uri(path);
    if let Some(session) = session {
        request = request.header(header::COOKIE, format!("aaidle_session={session}"));
    }
    let response = router(state.clone())
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null),
    )
}

#[tokio::test]
async fn dated_routes_enforce_authentication_real_dates_bounds_and_determinism_for_every_family() {
    let (state, session, _) = setup().await;
    let today = current_utc_date().unwrap().replace('-', "");
    let tomorrow = time::OffsetDateTime::now_utc()
        .date()
        .next_day()
        .unwrap()
        .format(format_description!("[year][month][day]"))
        .unwrap();
    for base in [
        "/games/classic/llm/normal",
        "/games/classic/cv/normal",
        "/games/timeline/normal",
        "/games/emoji/normal",
        "/games/logo/normal",
    ] {
        assert_eq!(read(&state, base, None).await.0, StatusCode::OK);
        for malformed in ["abc", "20260230", "20261301", "202608111"] {
            assert_eq!(
                read(&state, &format!("{base}/{malformed}"), Some(&session))
                    .await
                    .0,
                StatusCode::BAD_REQUEST
            );
        }
        for unavailable in ["20260810", tomorrow.as_str(), "20990101"] {
            assert_eq!(
                read(&state, &format!("{base}/{unavailable}"), Some(&session))
                    .await
                    .0,
                StatusCode::NOT_FOUND
            );
        }
        assert_eq!(
            read(&state, &format!("{base}/20260811"), None).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            read(&state, &format!("{base}/{today}"), None).await.0,
            StatusCode::UNAUTHORIZED
        );
        let (status, first) = read(&state, &format!("{base}/20260811"), Some(&session)).await;
        assert_eq!(status, StatusCode::OK, "{base}: {first}");
        let (_, again) = read(&state, &format!("{base}/20260811"), Some(&session)).await;
        assert_eq!(first, again);
        assert_eq!(first["challenge"]["date"], "2026-08-11");
        assert!(first["challenge"].get("answerModelId").is_none());
        let (_, current) = read(&state, base, Some(&session)).await;
        let (_, dated) = read(&state, &format!("{base}/{today}"), Some(&session)).await;
        assert_eq!(current["challenge"]["id"], dated["challenge"]["id"]);
    }
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM daily_challenges WHERE challenge_date > ?")
            .bind(current_utc_date().unwrap())
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert_eq!(count, 0);
    assert_eq!(
        read(&state, "/games/classic/hardcore/20260811", None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        read(&state, "/games/classic/hardcore/20260811", Some(&session))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        read(&state, "/games/classic/hardcore/abc", Some(&session))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    sqlx::query("UPDATE users SET disabled_at=1 WHERE id='user'")
        .execute(&state.db)
        .await
        .unwrap();
    assert_eq!(
        read(&state, "/games/classic/llm/normal/20260811", Some(&session))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn historical_challenge_id_routes_cannot_bypass_auth_and_completion_restores_without_streak_credit()
 {
    let (state, session, player) = setup().await;
    let (_, game) = read(&state, "/games/classic/llm/normal/20260811", Some(&session)).await;
    let id = game["challenge"]["id"].as_str().unwrap();
    let encoded = format!("%{:02X}{}", id.as_bytes()[0], &id[1..]);
    assert_eq!(
        read(
            &state,
            &format!("/games/classic/challenges/{encoded}/guesses"),
            None
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    for action in ["guesses", "hints", "stats", "trajectory"] {
        assert_eq!(
            read(
                &state,
                &format!("/games/classic/challenges/{id}/{action}"),
                None
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    let answer: String =
        sqlx::query_scalar("SELECT answer_model_id FROM daily_challenges WHERE id=?")
            .bind(id)
            .fetch_one(&state.db)
            .await
            .unwrap();
    let retry = Uuid::new_v4();
    for _ in 0..2 {
        let response = router(state.clone()).layer(Extension(ConnectInfo("127.0.0.1:0".parse::<std::net::SocketAddr>().unwrap())))
            .oneshot(Request::builder().method("POST").uri(format!("/games/classic/challenges/{id}/guesses"))
                .header(header::COOKIE,format!("aaidle_session={session}; aaidle_csrf=test"))
                .header(header::ORIGIN,"http://localhost:3000").header("x-aaidle-csrf-token","test").header(header::CONTENT_TYPE,"application/json")
                .body(Body::from(serde_json::json!({"playerId":player,"requestId":retry,"guessedModelId":answer,"attemptNumber":1}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
    let (_, history) = read(
        &state,
        &format!("/games/classic/challenges/{id}/guesses"),
        Some(&session),
    )
    .await;
    assert_eq!(history["guesses"].as_array().unwrap().len(), 1);
    assert_eq!(history["guesses"][0]["isCorrect"], true);
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_challenge_completions WHERE challenge_id=? AND user_id='user'",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(count, 1);
    assert_eq!(
        crate::repository::streaks::game_streaks(
            &state.db,
            player,
            time::OffsetDateTime::now_utc().date()
        )
        .await
        .unwrap()
        .classic
        .current_streak,
        0
    );
    let timeline = sqlx::query_scalar::<_, String>(
        "SELECT id FROM timeline_challenges WHERE challenge_date='2026-08-11'",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();
    for action in ["attempts", "auto-place", "start", "give-up"] {
        assert_eq!(
            read(
                &state,
                &format!("/games/timeline/challenges/{timeline}/{action}"),
                None
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    let request_id = Uuid::new_v4();
    for _ in 0..2 {
        let response = router(state.clone())
            .layer(Extension(ConnectInfo(
                "127.0.0.1:0".parse::<std::net::SocketAddr>().unwrap(),
            )))
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/games/timeline/challenges/{timeline}/attempts"))
                    .header(
                        header::COOKIE,
                        format!("aaidle_session={session}; aaidle_csrf=test"),
                    )
                    .header(header::ORIGIN, "http://localhost:3000")
                    .header("x-aaidle-csrf-token", "test")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        serde_json::json!({"playerId":player,"requestId":request_id,
                    "modelOrder":["card-0","card-1","card-2","card-3","card-4","card-5"]})
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
    let (_, restored) = read(&state, "/games/timeline/normal/20260811", Some(&session)).await;
    assert_eq!(restored["progress"]["solved"], true);
    assert_eq!(restored["progress"]["latestAttempt"]["attemptNumber"], 1);
    let streaks = crate::repository::streaks::game_streaks(
        &state.db,
        player,
        time::OffsetDateTime::now_utc().date(),
    )
    .await
    .unwrap();
    assert!(!streaks.timeline.secured_today);
    assert_eq!(streaks.timeline.current_streak, 0);
    for family in ["emoji", "logo"] {
        let (_, game) = read(
            &state,
            &format!("/games/{family}/normal/20260811"),
            Some(&session),
        )
        .await;
        let id = game["challenge"]["id"].as_str().unwrap();
        assert_eq!(
            read(
                &state,
                &format!("/games/{family}/challenges/{id}/guesses"),
                None
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
}
