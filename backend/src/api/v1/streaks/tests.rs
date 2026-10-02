use std::net::SocketAddr;

use crate::{
    api::v1::{current_utc_date, now_millis, router, test_support},
    repository::assists::tests::fixture,
    state::AppState,
};
use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode, header},
    response::Response,
};
use tower::ServiceExt;
use uuid::Uuid;

async fn json(response: Response) -> serde_json::Value {
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    serde_json::from_slice(&body).unwrap()
}

fn player_cookie(response: &Response) -> Option<String> {
    response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .find(|cookie| cookie.starts_with("aaidle_player="))
        .map(|cookie| cookie.split(';').next().unwrap().to_owned())
}

async fn streaks(state: &AppState, cookies: &str) -> Response {
    let mut request = Request::builder().uri("/me/streaks");
    if !cookies.is_empty() {
        request = request.header(header::COOKIE, cookies);
    }
    router(state.clone())
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

async fn win_classic(state: &AppState, challenge: Uuid, cookies: &str, csrf: Option<&str>) {
    let answer: String =
        sqlx::query_scalar("SELECT answer_model_id FROM daily_challenges WHERE id = ?")
            .bind(challenge.to_string())
            .fetch_one(&state.db)
            .await
            .unwrap();
    let mut request = Request::builder()
        .method("POST")
        .uri(format!("/games/classic/challenges/{challenge}/guesses"))
        .header(header::ORIGIN, "http://localhost:3000")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, cookies)
        .extension(ConnectInfo("127.0.0.1:1234".parse::<SocketAddr>().unwrap()));
    if let Some(csrf) = csrf {
        request = request.header("x-aaidle-csrf-token", csrf);
    }
    let response = router(state.clone())
        .oneshot(
            request
                .body(Body::from(
                    serde_json::json!({
                        "playerId": Uuid::new_v4(),
                        "requestId": Uuid::new_v4(),
                        "guessedModelId": answer,
                        "attemptNumber": 1,
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json(response).await["isCorrect"], true);
}

#[tokio::test]
async fn a_guest_win_over_http_secures_only_that_guests_classic_streak() {
    let (pool, challenge, _) = fixture().await;
    let state = test_support::state_with_pool(pool);
    let today = current_utc_date().unwrap();
    sqlx::query("UPDATE daily_challenges SET challenge_date = ? WHERE id = ?")
        .bind(&today)
        .bind(challenge.to_string())
        .execute(&state.db)
        .await
        .unwrap();

    let first = streaks(&state, "").await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(first.headers()[header::CACHE_CONTROL], "no-store");
    let guest = player_cookie(&first).unwrap();
    let empty = json(first).await;
    for family in ["classic", "timeline", "emoji", "logo"] {
        assert_eq!(empty[family]["currentStreak"], 0);
        assert_eq!(empty[family]["securedToday"], false);
        assert_eq!(empty[family]["lastStreakDate"], serde_json::Value::Null);
        // The history of qualifying days is not part of the public response
        assert!(empty[family].get("qualifyingDates").is_none());
    }

    win_classic(&state, challenge, &guest, None).await;
    if current_utc_date().unwrap() != today {
        return;
    }
    let after = streaks(&state, &guest).await;
    assert!(player_cookie(&after).is_none());
    let after = json(after).await;
    assert_eq!(after["currentGameDate"], today);
    assert_eq!(after["classic"]["currentStreak"], 1);
    assert_eq!(after["classic"]["longestStreak"], 1);
    assert_eq!(after["classic"]["securedToday"], true);
    assert_eq!(after["classic"]["lastStreakDate"], today);
    assert_eq!(after["timeline"]["currentStreak"], 0);

    // Another browser is another guest
    let other = json(streaks(&state, "").await).await;
    assert_eq!(other["classic"]["currentStreak"], 0);
}

#[tokio::test]
async fn account_streaks_follow_the_session_and_stop_after_sign_out() {
    let (pool, challenge, _) = fixture().await;
    let state = test_support::state_with_pool(pool);
    let today = current_utc_date().unwrap();
    sqlx::query("UPDATE daily_challenges SET challenge_date = ? WHERE id = ?")
        .bind(&today)
        .bind(challenge.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES ('u','u@example.test','u@example.test',0,0)").execute(&state.db).await.unwrap();
    let session = crate::auth::create_session(&state.db, "u", now_millis())
        .await
        .unwrap();

    // The first device's guest player becomes the account's primary player
    let device = player_cookie(&streaks(&state, "").await).unwrap();
    let signed_in = format!("{device}; aaidle_session={session}; aaidle_csrf=csrf");
    win_classic(&state, challenge, &signed_in, Some("csrf")).await;
    if current_utc_date().unwrap() != today {
        return;
    }
    assert_eq!(
        json(streaks(&state, &signed_in).await).await["classic"]["currentStreak"],
        1
    );
    // A second device sees the same account streak through its session
    let second_device = player_cookie(&streaks(&state, "").await).unwrap();
    assert_eq!(
        json(
            streaks(
                &state,
                &format!("{second_device}; aaidle_session={session}")
            )
            .await
        )
        .await["classic"]["currentStreak"],
        1
    );

    let logout = router(state.clone())
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/logout")
                .header(header::ORIGIN, "http://localhost:3000")
                .header(header::COOKIE, &signed_in)
                .header("x-aaidle-csrf-token", "csrf")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(logout.status(), StatusCode::NO_CONTENT);
    let signed_out = player_cookie(&logout).unwrap();
    assert_ne!(signed_out, device);
    // The signed-out browser is a new guest and no longer reads the account's streak
    let guest = json(streaks(&state, &signed_out).await).await;
    assert_eq!(guest["classic"]["currentStreak"], 0);
    assert_eq!(guest["classic"]["lastStreakDate"], serde_json::Value::Null);

    sqlx::query("UPDATE users SET disabled_at = 1 WHERE id = 'u'")
        .execute(&state.db)
        .await
        .unwrap();
    let session = crate::auth::create_session(&state.db, "u", now_millis())
        .await
        .unwrap();
    assert_eq!(
        streaks(&state, &format!("{device}; aaidle_session={session}"))
            .await
            .status(),
        StatusCode::FORBIDDEN
    );
    state.db.close().await;
    assert_eq!(
        streaks(&state, &device).await.status(),
        StatusCode::INTERNAL_SERVER_ERROR
    );
}
