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

async fn post(
    state: &AppState,
    path: &str,
    session: Option<&str>,
    body: serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    let mut request = Request::builder()
        .method("POST")
        .uri(path)
        .header(header::ORIGIN, "http://localhost:3000")
        .header(header::CONTENT_TYPE, "application/json")
        .extension(ConnectInfo(
            "127.0.0.1:0".parse::<std::net::SocketAddr>().unwrap(),
        ));
    if let Some(session) = session {
        request = request
            .header(
                header::COOKIE,
                format!("aaidle_session={session}; aaidle_csrf=test"),
            )
            .header("x-aaidle-csrf-token", "test");
    }
    let response = router(state.clone())
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
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

#[test]
fn the_guard_covers_every_route_below_a_challenge_id() {
    let id = "2c8d3858-8e24-4ad0-b1d3-7d231af19a58";
    for (path, expected) in [
        ("/games/classic/challenges/ID/guesses", Some("classic")),
        ("/games/classic/challenges/ID", Some("classic")),
        (
            "/games/classic/challenges/ID/guesses/extra",
            Some("classic"),
        ),
        ("/games/logo/challenges/ID/image", Some("logo")),
        ("/games/emoji/challenges/ID/hints", Some("emoji")),
        ("/games/timeline/challenges/ID/attempts", Some("timeline")),
        (
            "/games/timeline/challenges/ID/leaderboard/extra",
            Some("timeline"),
        ),
        (
            "/games/future-game/challenges/ID/guesses",
            Some("future-game"),
        ),
        // Public by design, or not addressed by challenge ID at all
        ("/games/timeline/challenges/ID/leaderboard", None),
        ("/games/classic/llm/normal", None),
        ("/games/classic/challenges", None),
        ("/games/timeline/leaderboard/2026-09-30", None),
        ("/auth/progress", None),
        ("/me/streaks", None),
    ] {
        let path = path.replace("ID", id);
        assert_eq!(
            guarded_challenge(&path),
            expected.map(|family| (family, id)),
            "{path}"
        );
    }
}

#[test]
fn yesterdays_game_stays_current_only_during_the_rollover_grace() {
    use time::macros::datetime;
    let day = date!(2026 - 09 - 30);
    assert!(is_current_game(day, datetime!(2026-09-30 00:00 UTC)));
    assert!(is_current_game(day, datetime!(2026-09-30 23:59:59 UTC)));
    assert!(is_current_game(day, datetime!(2026-10-01 00:00 UTC)));
    assert!(is_current_game(day, datetime!(2026-10-01 00:59:59 UTC)));
    assert!(!is_current_game(day, datetime!(2026-10-01 01:00 UTC)));
    assert!(!is_current_game(day, datetime!(2026-10-02 00:30 UTC)));
    assert!(!is_current_game(day, datetime!(2026-09-29 23:59 UTC)));
}

#[tokio::test]
async fn unknown_families_and_deeper_paths_never_reach_a_handler_unchecked() {
    let (state, session, _) = setup().await;
    let (_, game) = read(&state, "/games/classic/llm/normal/20260811", Some(&session)).await;
    let id = game["challenge"]["id"].as_str().unwrap();
    // The guard answers before routing, so a path the router does not know is still refused
    assert_eq!(
        read(
            &state,
            &format!("/games/classic/challenges/{id}/guesses/extra"),
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        read(
            &state,
            &format!("/games/future-game/challenges/{id}/guesses"),
            Some(&session)
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    // The public Speedrun leaderboard stays public, also for a disabled account
    let speedrun = timeline_fixture(
        &state.db,
        crate::domain::timeline::TimelineDifficulty::Speedrun,
    )
    .await;
    sqlx::query("UPDATE timeline_challenges SET challenge_date='2026-08-12' WHERE id=?")
        .bind(speedrun.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    let leaderboard = format!("/games/timeline/challenges/{speedrun}/leaderboard");
    assert_eq!(read(&state, &leaderboard, None).await.0, StatusCode::OK);
    sqlx::query("UPDATE users SET disabled_at=1 WHERE id='user'")
        .execute(&state.db)
        .await
        .unwrap();
    assert_eq!(
        read(&state, &leaderboard, Some(&session)).await.0,
        StatusCode::OK
    );
    assert_eq!(
        read(
            &state,
            &format!("/games/classic/challenges/{id}/guesses"),
            Some(&session)
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn a_stored_future_game_is_indistinguishable_from_a_missing_one() {
    let (state, session, _) = setup().await;
    let tomorrow = time::OffsetDateTime::now_utc().date().next_day().unwrap();
    let compact = tomorrow
        .format(format_description!("[year][month][day]"))
        .unwrap();
    let dated = tomorrow
        .format(format_description!("[year]-[month]-[day]"))
        .unwrap();
    let bases = [
        "/games/classic/llm/normal",
        "/games/timeline/normal",
        "/games/emoji/normal",
        "/games/logo/normal",
    ];
    let mut before = Vec::new();
    for base in bases {
        before.push(read(&state, &format!("{base}/{compact}"), Some(&session)).await);
    }
    // Pre-generate tomorrow in every family
    let classic = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) VALUES (?,?,'classic:llm:normal','model-1',1,0,'test')")
        .bind(&classic).bind(&dated).execute(&state.db).await.unwrap();
    let timeline = timeline_fixture(
        &state.db,
        crate::domain::timeline::TimelineDifficulty::Challenge,
    )
    .await
    .to_string();
    sqlx::query("UPDATE timeline_challenges SET challenge_date=? WHERE id=?")
        .bind(&dated)
        .bind(&timeline)
        .execute(&state.db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO timeline_challenges (id,challenge_date,difficulty,model_order_json,anchor_positions_json,tray_order_json,selection_version,generated_at,generation_source) SELECT ?,challenge_date,'normal',model_order_json,anchor_positions_json,tray_order_json,selection_version,generated_at,generation_source FROM timeline_challenges WHERE id=?")
        .bind(Uuid::new_v4().to_string()).bind(&timeline).execute(&state.db).await.unwrap();
    let entity = state.emoji.eligible(0).next().unwrap().id.clone();
    let emoji = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO visual_clue_challenges VALUES (?,?,'emoji:normal',?,'v',1,0)")
        .bind(&emoji)
        .bind(&dated)
        .bind(&entity)
        .execute(&state.db)
        .await
        .unwrap();
    let logo = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO logo_challenges VALUES (?,?,'logo:normal','model-1','asset',1,0)")
        .bind(&logo)
        .bind(&dated)
        .execute(&state.db)
        .await
        .unwrap();

    for (base, before) in bases.into_iter().zip(before) {
        let after = read(&state, &format!("{base}/{compact}"), Some(&session)).await;
        assert_eq!(after.0, StatusCode::NOT_FOUND, "{base}");
        assert_eq!(after, before, "{base}");
    }
    for (path, body) in [
        (
            format!("/games/classic/challenges/{classic}/guesses"),
            serde_json::json!({"playerId":Uuid::new_v4(),"requestId":Uuid::new_v4(),"guessedModelId":"model-1","attemptNumber":1}),
        ),
        (
            format!("/games/timeline/challenges/{timeline}/attempts"),
            serde_json::json!({"playerId":Uuid::new_v4(),"requestId":Uuid::new_v4(),"modelOrder":["card-0","card-1","card-2","card-3","card-4","card-5"]}),
        ),
        (
            format!("/games/emoji/challenges/{emoji}/guesses"),
            serde_json::json!({"playerId":Uuid::new_v4(),"requestId":Uuid::new_v4(),"guessedEntityId":entity,"attemptNumber":1}),
        ),
        (
            format!("/games/logo/challenges/{logo}/guesses"),
            serde_json::json!({"playerId":Uuid::new_v4(),"requestId":Uuid::new_v4(),"guessedModelId":"model-1","attemptNumber":1}),
        ),
    ] {
        for session in [None, Some(session.as_str())] {
            assert_eq!(read(&state, &path, session).await.0, StatusCode::NOT_FOUND);
            assert_eq!(
                post(&state, &path, session, body.clone()).await.0,
                StatusCode::NOT_FOUND,
                "{path}"
            );
        }
    }
    for table in [
        "guess_events",
        "timeline_attempts",
        "visual_clue_guess_events",
        "logo_guess_events",
    ] {
        let events: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert_eq!(events, 0, "{table}");
    }
}

#[tokio::test]
async fn emoji_and_logo_history_is_playable_only_when_signed_in_and_never_earns_a_streak() {
    let (state, session, player) = setup().await;
    for (family, table, column, field) in [
        (
            "emoji",
            "visual_clue_challenges",
            "answer_entity_id",
            "guessedEntityId",
        ),
        (
            "logo",
            "logo_challenges",
            "answer_model_id",
            "guessedModelId",
        ),
    ] {
        let (status, game) = read(
            &state,
            &format!("/games/{family}/normal/20260811"),
            Some(&session),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{family}: {game}");
        let id = game["challenge"]["id"].as_str().unwrap().to_owned();
        let answer: String =
            sqlx::query_scalar(&format!("SELECT {column} FROM {table} WHERE id = ?"))
                .bind(&id)
                .fetch_one(&state.db)
                .await
                .unwrap();
        let path = format!("/games/{family}/challenges/{id}/guesses");
        let request = Uuid::new_v4();
        let body = serde_json::json!({"playerId":player,"requestId":request,field:answer,"attemptNumber":1});
        // A guest cannot write to a past game
        assert_eq!(
            post(&state, &path, None, body.clone()).await.0,
            StatusCode::UNAUTHORIZED
        );
        let (status, outcome) = post(&state, &path, Some(&session), body.clone()).await;
        assert_eq!(status, StatusCode::OK, "{family}: {outcome}");
        assert_eq!(outcome["isCorrect"], true);
        // The completion is stored once and restored on the next visit
        assert_ne!(
            post(&state, &path, Some(&session), body).await.0,
            StatusCode::OK
        );
        let (_, history) = read(&state, &path, Some(&session)).await;
        let guesses = history["guesses"].as_array().unwrap();
        assert_eq!(guesses.len(), 1);
        assert_eq!(guesses[0]["isCorrect"], true);
        assert!(!history.to_string().contains("answerModelId"));
        assert!(!history.to_string().contains("answerEntityId"));
    }
    let streaks = crate::repository::streaks::game_streaks(
        &state.db,
        player,
        time::OffsetDateTime::now_utc().date(),
    )
    .await
    .unwrap();
    for streak in [streaks.emoji, streaks.logo] {
        assert_eq!(streak.current_streak, 0);
        assert_eq!(streak.last_streak_date, None);
        assert!(!streak.secured_today);
    }
}

#[tokio::test]
async fn todays_hardcore_keeps_its_older_spelling_and_drifted_days_are_unavailable() {
    let (state, session, _) = setup().await;
    let plain = read(&state, "/games/classic/hardcore", Some(&session)).await;
    let spelled = read(&state, "/games/classic/hardcore/hardcore", Some(&session)).await;
    assert_ne!(spelled.0, StatusCode::BAD_REQUEST);
    assert_eq!(spelled, plain);

    // A stored day whose answer has left the pool is reported instead of being unwinnable
    let (status, game) = read(&state, "/games/classic/llm/normal/20260811", Some(&session)).await;
    assert_eq!(status, StatusCode::OK);
    let id = game["challenge"]["id"].as_str().unwrap();
    sqlx::query("UPDATE models SET status = 'retired' WHERE id = (SELECT answer_model_id FROM daily_challenges WHERE id = ?)")
        .bind(id)
        .execute(&state.db)
        .await
        .unwrap();
    let (status, body) = read(&state, "/games/classic/llm/normal/20260811", Some(&session)).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{body}");
    assert!(!body.to_string().contains("model-"));
}
