use crate::{
    api::v1::{router, test_support},
    repository::assists::tests::fixture,
};
use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use tower::ServiceExt;

#[tokio::test]
async fn routes_validate_dates_verified_tiers_origin_csrf_and_disabled_accounts() {
    let (pool, _, _) = fixture().await;
    let state = test_support::state_with_pool(pool);
    sqlx::query("INSERT INTO users(id,email,email_normalized,created_at,updated_at) VALUES('u','u@test.test','u@test.test',0,0)").execute(&state.db).await.unwrap();
    let session = crate::auth::create_session(&state.db, "u", super::super::now_millis())
        .await
        .unwrap();
    for (method, path, body, cookie, origin, csrf, status) in [
        ("GET", "today", "", false, false, false, StatusCode::OK),
        (
            "GET",
            "20260811",
            "",
            false,
            false,
            false,
            StatusCode::UNAUTHORIZED,
        ),
        ("GET", "20260811", "", true, false, false, StatusCode::OK),
        (
            "GET",
            "abc",
            "",
            true,
            false,
            false,
            StatusCode::BAD_REQUEST,
        ),
        (
            "GET",
            "20260230",
            "",
            true,
            false,
            false,
            StatusCode::BAD_REQUEST,
        ),
        (
            "GET",
            "20990101",
            "",
            true,
            false,
            false,
            StatusCode::NOT_FOUND,
        ),
        (
            "GET",
            "20260810",
            "",
            true,
            false,
            false,
            StatusCode::NOT_FOUND,
        ),
        (
            "POST",
            "today/seen",
            "{",
            true,
            true,
            true,
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            "today/seen",
            r#"{"tier":"imaginary"}"#,
            true,
            true,
            true,
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            "today/seen",
            r#"{"tier":"normal"}"#,
            true,
            false,
            true,
            StatusCode::FORBIDDEN,
        ),
        (
            "POST",
            "today/seen",
            r#"{"tier":"normal"}"#,
            true,
            true,
            false,
            StatusCode::FORBIDDEN,
        ),
        (
            "POST",
            "today/seen",
            r#"{"tier":"hardcore"}"#,
            true,
            true,
            true,
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            "today/seen",
            r#"{"tier":null,"goatSeen":true}"#,
            false,
            true,
            false,
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            "today/seen",
            r#"{"tier":null}"#,
            true,
            true,
            true,
            StatusCode::OK,
        ),
        (
            "POST",
            "today/seen",
            r#"{"tier":null}"#,
            false,
            true,
            false,
            StatusCode::OK,
        ),
    ] {
        let mut request = Request::builder()
            .method(method)
            .uri(format!("/games/daily-completion/{path}"));
        if cookie {
            request = request.header(
                header::COOKIE,
                format!("aaidle_session={session}; aaidle_csrf=test"),
            );
        }
        if origin {
            request = request.header(header::ORIGIN, "http://localhost:3000");
        }
        if csrf {
            request = request.header("x-aaidle-csrf-token", "test");
        }
        let response = router(state.clone())
            .oneshot(
                request
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), status, "{method} {path} {body}");
    }
    sqlx::query("UPDATE users SET disabled_at=1 WHERE id='u'")
        .execute(&state.db)
        .await
        .unwrap();
    let response = router(state)
        .oneshot(
            Request::builder()
                .uri("/games/daily-completion/today")
                .header(header::COOKIE, format!("aaidle_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
