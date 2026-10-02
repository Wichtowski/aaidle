use super::*;
use crate::{
    api::v1::{router, test_support},
    domain::timeline::TimelineDifficulty,
    repository::assists::tests::{fixture, miss, timeline_fixture, timeline_miss},
};
use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use tower::ServiceExt;

fn peer() -> ConnectInfo<SocketAddr> {
    ConnectInfo("127.0.0.1:1234".parse().unwrap())
}

#[tokio::test]
async fn routes_validate_identifiers_payloads_origins_modes_and_missing_resources() {
    let (pool, classic, _) = fixture().await;
    let state = test_support::state_with_pool(pool);
    let timeline = timeline_fixture(&state.db, TimelineDifficulty::Normal).await;
    for path in [
        format!("/games/classic/challenges/{classic}/hints"),
        format!("/games/timeline/challenges/{timeline}/auto-place"),
    ] {
        let response = router(state.clone())
            .oneshot(Request::builder().uri(&path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(value.get("answerModelId").is_none());
        assert!(value.get("modelOrder").is_none());
        for (body, origin, expected) in [
            ("{}", Some("http://localhost:3000"), StatusCode::BAD_REQUEST),
            (
                "null",
                Some("http://localhost:3000"),
                StatusCode::BAD_REQUEST,
            ),
            (
                "not json",
                Some("http://localhost:3000"),
                StatusCode::BAD_REQUEST,
            ),
            (
                if path.contains("classic") {
                    r#"{"column":"release","extra":true}"#
                } else {
                    r#"{"cardId":"card-1","extra":true}"#
                },
                Some("http://localhost:3000"),
                StatusCode::BAD_REQUEST,
            ),
            (
                if path.contains("classic") {
                    r#"{"column":"release"}"#
                } else {
                    r#"{"cardId":"card-1"}"#
                },
                None,
                StatusCode::FORBIDDEN,
            ),
            (
                if path.contains("classic") {
                    r#"{"column":"release"}"#
                } else {
                    r#"{"cardId":"card-1"}"#
                },
                Some("https://other.example"),
                StatusCode::FORBIDDEN,
            ),
            (
                if path.contains("classic") {
                    r#"{"column":"release"}"#
                } else {
                    r#"{"cardId":"card-1"}"#
                },
                Some("http://localhost:3000"),
                StatusCode::CONFLICT,
            ),
        ] {
            let mut request = Request::builder()
                .method("POST")
                .uri(&path)
                .header(header::CONTENT_TYPE, "application/json");
            if let Some(origin) = origin {
                request = request.header(header::ORIGIN, origin);
            }
            let response = router(state.clone())
                .oneshot(request.extension(peer()).body(Body::from(body)).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if expected == StatusCode::CONFLICT {
                let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                    .await
                    .unwrap();
                let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(
                    value["error"]["code"],
                    if path.contains("classic") {
                        "HINT_NOT_AVAILABLE"
                    } else {
                        "AUTO_PLACE_NOT_AVAILABLE"
                    }
                );
            }
        }
        for (id, expected) in [
            ("invalid".to_owned(), StatusCode::BAD_REQUEST),
            (Uuid::new_v4().to_string(), StatusCode::NOT_FOUND),
        ] {
            let original = if path.contains("classic") {
                classic
            } else {
                timeline
            }
            .to_string();
            let path = path.replace(&original, &id);
            let response = router(state.clone())
                .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
        }
    }
    let path = format!("/games/timeline/challenges/{timeline}/auto-place");
    let response = router(state.clone())
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(path)
                .header(header::ORIGIN, "http://localhost:3000")
                .header(header::CONTENT_TYPE, "application/json")
                .extension(peer())
                .body(Body::from("x".repeat(17000)))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn authenticated_assists_use_canonical_player_and_require_csrf() {
    let (pool, classic, canonical) = fixture().await;
    let state = test_support::state_with_pool(pool);
    sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES ('user','user@example.test','user@example.test',0,0)").execute(&state.db).await.unwrap();
    crate::progress::canonical_player_id(&state.db, "user", canonical, now_millis())
        .await
        .unwrap();
    let session = crate::auth::create_session(&state.db, "user", now_millis())
        .await
        .unwrap();
    let timeline = timeline_fixture(&state.db, TimelineDifficulty::Normal).await;
    for _ in 0..3 {
        timeline_miss(&state.db, timeline, canonical).await;
    }
    let mut headers = HeaderMap::new();
    headers.insert(
        header::COOKIE,
        format!("aaidle_session={session}; aaidle_csrf=test")
            .parse()
            .unwrap(),
    );
    headers.insert(header::ORIGIN, "http://localhost:3000".parse().unwrap());
    let anonymous = Uuid::new_v4();
    assert!(matches!(
        timeline_auto_place(
            State(state.clone()),
            Extension(AnonymousPlayerId(anonymous)),
            peer(),
            headers.clone(),
            Path(timeline.to_string()),
            Ok(Json(TimelineAutoPlaceRequest {
                card_id: "card-1".into()
            }))
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    headers.insert("x-aaidle-csrf-token", "test".parse().unwrap());
    let response = timeline_auto_place(
        State(state.clone()),
        Extension(AnonymousPlayerId(anonymous)),
        peer(),
        headers.clone(),
        Path(timeline.to_string()),
        Ok(Json(TimelineAutoPlaceRequest {
            card_id: "card-1".into(),
        })),
    )
    .await
    .unwrap()
    .0;
    assert_eq!(response.auto_placements[0].position, 1);
    assert_eq!(
        timeline_state(
            State(state.clone()),
            Extension(AnonymousPlayerId(anonymous)),
            headers.clone(),
            Path(timeline.to_string())
        )
        .await
        .unwrap()
        .0
        .auto_placements
        .len(),
        1
    );
    assert!(matches!(
        classic_hint(
            State(state.clone()),
            Extension(AnonymousPlayerId(anonymous)),
            peer(),
            headers.clone(),
            Path(classic.to_string()),
            Ok(Json(ClassicHintRequest {
                column: "release".into()
            }))
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    assert_eq!(
        classic_state(
            State(state.clone()),
            Extension(AnonymousPlayerId(anonymous)),
            headers.clone(),
            Path(classic.to_string())
        )
        .await
        .unwrap()
        .0
        .remaining_hints,
        0
    );
    miss(&state.db, classic, canonical).await;
    let hint = classic_hint(
        State(state.clone()),
        Extension(AnonymousPlayerId(anonymous)),
        peer(),
        headers.clone(),
        Path(classic.to_string()),
        Ok(Json(ClassicHintRequest {
            column: "release".into(),
        })),
    )
    .await
    .unwrap()
    .0;
    assert_eq!(hint.hints.len(), 1);
    sqlx::query("UPDATE users SET disabled_at = 1 WHERE id = 'user'")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        classic_state(
            State(state),
            Extension(AnonymousPlayerId(anonymous)),
            headers,
            Path(classic.to_string())
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
}
