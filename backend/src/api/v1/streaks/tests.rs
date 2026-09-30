use super::*;
use crate::api::v1::{now_millis, router, test_support};
use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn guests_and_accounts_receive_only_their_canonical_player_streaks() {
    let state = test_support::state().await;
    let response = router(state.clone())
        .oneshot(
            Request::builder()
                .uri("/me/streaks")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["classic"]["currentStreak"], 0);
    assert_eq!(value["logo"]["securedToday"], false);
    sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES ('u','u@example.test','u@example.test',0,0)").execute(&state.db).await.unwrap();
    let canonical = Uuid::new_v4();
    crate::progress::canonical_player_id(&state.db, "u", canonical, now_millis())
        .await
        .unwrap();
    let today = OffsetDateTime::now_utc().date();
    sqlx::query("INSERT INTO player_game_streak_days VALUES (?,'classic',?,?)")
        .bind(canonical.to_string())
        .bind(crate::api::v1::current_utc_date().unwrap())
        .bind(now_millis())
        .execute(&state.db)
        .await
        .unwrap();
    let session = crate::auth::create_session(&state.db, "u", now_millis())
        .await
        .unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(
        header::COOKIE,
        format!("aaidle_session={session}").parse().unwrap(),
    );
    let response = get(
        State(state.clone()),
        Extension(AnonymousPlayerId(Uuid::new_v4())),
        headers.clone(),
    )
    .await
    .unwrap()
    .0;
    assert_eq!(response.classic.current_streak, 1);
    assert_eq!(
        response.current_game_date,
        crate::repository::streaks::game_streaks(&state.db, canonical, today)
            .await
            .unwrap()
            .current_game_date
    );
    sqlx::query("UPDATE users SET disabled_at = 1 WHERE id = 'u'")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(
        get(
            State(state.clone()),
            Extension(AnonymousPlayerId(canonical)),
            headers
        )
        .await
        .is_err()
    );
    state.db.close().await;
    assert!(
        get(
            State(state),
            Extension(AnonymousPlayerId(canonical)),
            HeaderMap::new()
        )
        .await
        .is_err()
    );
}
