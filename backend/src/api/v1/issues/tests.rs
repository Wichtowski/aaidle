use super::*;
use axum::{
    body::Body,
    http::{HeaderValue, Request, header},
};
use tower::ServiceExt;

async fn authenticated_headers(state: &AppState, issue_limit: i64) -> (String, HeaderMap) {
    let user_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id,email,email_normalized,email_verified_at,issue_report_limit,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
        .bind(&user_id)
        .bind(format!("{user_id}@example.com"))
        .bind(format!("{user_id}@example.com"))
        .bind(1_i64)
        .bind(issue_limit)
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
    (user_id, headers)
}

fn request(game: &str, title: &str, description: &str) -> IssueReportRequest {
    IssueReportRequest {
        game: game.to_owned(),
        title: title.to_owned(),
        description: description.to_owned(),
    }
}

#[test]
fn issue_text_limits_match_browser_utf16_length_rules() {
    assert!(validate_issue_text("12345678", &"a".repeat(5_000)).is_ok());
    assert!(validate_issue_text("12345678", &"😀".repeat(2_500)).is_ok());
    assert!(validate_issue_text("12345678", &"😀".repeat(2_501)).is_err());
    assert!(validate_issue_text(&"é".repeat(120), &"a".repeat(20)).is_ok());
    assert!(validate_issue_text(&"é".repeat(121), &"a".repeat(20)).is_err());
    assert!(validate_issue_text("1234567", &"a".repeat(20)).is_err());
    assert!(validate_issue_text("12345678", &"a".repeat(19)).is_err());
}

#[test]
fn issue_games_are_an_explicit_allowlist() {
    assert_eq!(ISSUE_GAMES, ["classic", "emoji", "timeline", "logo"]);
    assert!(!ISSUE_GAMES.contains(&"Classic"));
}

#[tokio::test]
async fn issue_creation_rejects_missing_origin_before_auth_or_delivery() {
    let state = super::super::test_support::state().await;
    let result = create(
        State(state),
        HeaderMap::new(),
        Ok(Json(IssueReportRequest {
            game: "classic".to_owned(),
            title: "A valid title".to_owned(),
            description: "A sufficiently long description".to_owned(),
        })),
    )
    .await;
    assert!(matches!(result, Err(AppError::Forbidden(_))));
}

#[tokio::test]
async fn issue_creation_validates_auth_game_and_trimmed_text() {
    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, 3).await;

    let mut bad_csrf = headers.clone();
    bad_csrf.remove("x-aaidle-csrf-token");
    assert!(matches!(
        create(
            State(state.clone()),
            bad_csrf,
            Ok(Json(request(
                "classic",
                "A valid title",
                "A sufficiently long description",
            ))),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        create(
            State(state.clone()),
            headers.clone(),
            Ok(Json(request(
                "Classic",
                "A valid title",
                "A sufficiently long description",
            ))),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        create(
            State(state.clone()),
            headers.clone(),
            Ok(Json(request(
                " classic ",
                " short ",
                " A sufficiently long description ",
            ))),
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let result = create(
        State(state),
        headers,
        Ok(Json(request(
            " classic ",
            " A valid title ",
            " A sufficiently long description ",
        ))),
    )
    .await;
    assert!(matches!(result, Err(AppError::Unavailable(_))));
}

#[tokio::test]
async fn issue_handlers_reject_anonymous_and_malformed_requests() {
    let state = super::super::test_support::state().await;
    let headers = HeaderMap::from_iter([
        (
            header::ORIGIN,
            HeaderValue::from_static("http://localhost:3000"),
        ),
        (header::COOKIE, HeaderValue::from_static("aaidle_csrf=csrf")),
        (
            "x-aaidle-csrf-token".parse().unwrap(),
            HeaderValue::from_static("csrf"),
        ),
    ]);
    assert!(matches!(
        create(
            State(state.clone()),
            headers.clone(),
            Ok(Json(request(
                "classic",
                "A valid title",
                "A sufficiently long description",
            ))),
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
    assert!(matches!(
        request_limit_increase(State(state.clone()), headers).await,
        Err(AppError::Unauthorized(_))
    ));

    let (_, headers) = authenticated_headers(&state, 1).await;
    let malformed_request = Request::post("/issues")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ORIGIN, headers[header::ORIGIN].clone())
        .header(header::COOKIE, headers[header::COOKIE].clone())
        .header(
            "x-aaidle-csrf-token",
            headers["x-aaidle-csrf-token"].clone(),
        )
        .body(Body::from("{"))
        .unwrap();
    let response = super::super::router(state)
        .oneshot(malformed_request)
        .await
        .unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, 1).await;
    state.db.close().await;
    assert!(matches!(
        create(
            State(state),
            headers,
            Ok(Json(request(
                "classic",
                "A valid title",
                "A sufficiently long description",
            ))),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn issue_creation_enforces_per_user_rate_limit() {
    let state = super::super::test_support::state().await;
    let (user_id, headers) = authenticated_headers(&state, 3).await;
    let subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "issue-report-user", &user_id)
            .unwrap();
    for _ in 0..3 {
        assert!(
            crate::auth::consume_rate_limit(
                &state.db,
                "issue-report",
                &subject,
                3,
                24 * 60 * 60 * 1_000,
                now_millis(),
            )
            .await
            .unwrap()
        );
    }
    assert!(matches!(
        create(
            State(state),
            headers,
            Ok(Json(request(
                "classic",
                "A valid title",
                "A sufficiently long description",
            ))),
        )
        .await,
        Err(AppError::TooManyRequests { .. })
    ));
}

#[tokio::test]
async fn zero_limit_disables_reports_and_allows_an_increase_request() {
    let state = super::super::test_support::state().await;
    let (user_id, headers) = authenticated_headers(&state, 0).await;

    assert!(matches!(
        create(
            State(state.clone()),
            headers.clone(),
            Ok(Json(request(
                "classic",
                "A valid title",
                "A sufficiently long description",
            ))),
        )
        .await,
        Err(AppError::TooManyRequests { .. })
    ));
    let Json(response) = request_limit_increase(State(state.clone()), headers)
        .await
        .unwrap();
    assert!(response.accepted);
    let requested_at = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT issue_report_limit_requested_at FROM users WHERE id = ?",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert!(requested_at.is_some());
}

#[tokio::test]
async fn increase_request_requires_the_current_limit_to_be_reached() {
    let state = super::super::test_support::state().await;
    let (user_id, headers) = authenticated_headers(&state, 2).await;
    assert!(matches!(
        request_limit_increase(State(state.clone()), headers.clone()).await,
        Err(AppError::Validation(_))
    ));

    let subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "issue-report-user", &user_id)
            .unwrap();
    for _ in 0..2 {
        assert!(
            crate::auth::consume_rate_limit(
                &state.db,
                "issue-report",
                &subject,
                2,
                24 * 60 * 60 * 1_000,
                now_millis(),
            )
            .await
            .unwrap()
        );
    }
    assert!(request_limit_increase(State(state), headers).await.is_ok());
}

#[tokio::test]
async fn issue_database_errors_propagate_from_rate_limit_and_request_updates() {
    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, 1).await;
    sqlx::query(
        "CREATE TRIGGER reject_issue_rate_limit BEFORE INSERT ON request_rate_limits BEGIN SELECT RAISE(ABORT, 'forced issue rate limit failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        create(
            State(state),
            headers,
            Ok(Json(request(
                "classic",
                "A valid title",
                "A sufficiently long description",
            ))),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (user_id, headers) = authenticated_headers(&state, 1).await;
    let subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "issue-report-user", &user_id)
            .unwrap();
    sqlx::query(
        "INSERT INTO request_rate_limits (scope, subject_hash, window_started_at, count) VALUES ('issue-report', ?, ?, 1)",
    )
    .bind(subject)
    .bind(now_millis())
    .execute(&state.db)
    .await
    .unwrap();
    sqlx::query(
        "CREATE TRIGGER corrupt_issue_count AFTER UPDATE ON user_sessions BEGIN UPDATE request_rate_limits SET count = 'invalid'; END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        request_limit_increase(State(state), headers).await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, 0).await;
    sqlx::query(
        "CREATE TRIGGER reject_limit_request BEFORE UPDATE OF issue_report_limit_requested_at ON users BEGIN SELECT RAISE(ABORT, 'forced limit request failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        request_limit_increase(State(state), headers).await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn limit_increase_enforces_origin_and_csrf_before_database_work() {
    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, 0).await;
    assert!(matches!(
        request_limit_increase(State(state.clone()), HeaderMap::new()).await,
        Err(AppError::Forbidden(_))
    ));
    let mut missing_csrf = headers;
    missing_csrf.remove("x-aaidle-csrf-token");
    assert!(matches!(
        request_limit_increase(State(state), missing_csrf).await,
        Err(AppError::Forbidden(_))
    ));
}
