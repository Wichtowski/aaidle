use http_body_util::BodyExt;
use serde_json::{Value, json};

use super::*;

async fn response_parts(error: AppError) -> (StatusCode, axum::http::HeaderMap, Value) {
    let response = error.into_response();
    let status = response.status();
    let headers = response.headers().clone();
    let body = response
        .into_body()
        .collect()
        .await
        .expect("response body")
        .to_bytes();
    let value = serde_json::from_slice(&body).expect("JSON error response");
    (status, headers, value)
}

async fn assert_error(error: AppError, status: StatusCode, code: &str, message: &str) {
    let (actual_status, _, body) = response_parts(error).await;
    assert_eq!(actual_status, status);
    assert_eq!(
        body,
        json!({ "error": { "code": code, "message": message } })
    );
}

#[test]
fn constructors_and_error_display_preserve_messages() {
    assert_eq!(
        AppError::config("bad setting").to_string(),
        "configuration error: bad setting"
    );
    assert_eq!(
        AppError::validation("bad input").to_string(),
        "validation error: bad input"
    );
    assert_eq!(
        AppError::rate_limited("slow down", 12).to_string(),
        "rate limit exceeded: slow down"
    );
    assert_eq!(
        AppError::PayloadTooLarge.to_string(),
        "request body too large"
    );
}

#[tokio::test]
async fn public_error_variants_map_to_their_http_contract() {
    assert_error(
        AppError::validation("Invalid field."),
        StatusCode::BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid field.",
    )
    .await;
    assert_error(
        AppError::NotFound("Missing.".to_owned()),
        StatusCode::NOT_FOUND,
        "NOT_FOUND",
        "Missing.",
    )
    .await;
    assert_error(
        AppError::Unauthorized("Sign in.".to_owned()),
        StatusCode::UNAUTHORIZED,
        "UNAUTHENTICATED",
        "Sign in.",
    )
    .await;
    assert_error(
        AppError::Forbidden("No access.".to_owned()),
        StatusCode::FORBIDDEN,
        "FORBIDDEN",
        "No access.",
    )
    .await;
    assert_error(
        AppError::Unavailable("Try later.".to_owned()),
        StatusCode::SERVICE_UNAVAILABLE,
        "SERVICE_UNAVAILABLE",
        "Try later.",
    )
    .await;
    assert_error(
        AppError::PayloadTooLarge,
        StatusCode::PAYLOAD_TOO_LARGE,
        "PAYLOAD_TOO_LARGE",
        "The request body exceeds the 16 KB limit.",
    )
    .await;
}

#[tokio::test]
async fn conflict_codes_map_known_and_unknown_domain_cases() {
    let cases = [
        (
            "DUPLICATE_GUESS",
            "DUPLICATE_GUESS",
            "This model has already been guessed.",
        ),
        (
            "CHALLENGE_COMPLETED",
            "CHALLENGE_COMPLETED",
            "This challenge has already been completed by this player.",
        ),
        (
            "REQUEST_ID_REUSED",
            "REQUEST_ID_REUSED",
            "This request ID was used for a different guess.",
        ),
        (
            "ATTEMPT_LIMIT_REACHED",
            "ATTEMPT_LIMIT_REACHED",
            "Every available answer for this challenge has already been guessed.",
        ),
        (
            "TIMELINE_ATTEMPT_LIMIT_REACHED",
            "ATTEMPT_LIMIT_REACHED",
            "No Timeline submissions remain for this challenge.",
        ),
        (
            "TIMELINE_CHALLENGE_COMPLETED",
            "CHALLENGE_COMPLETED",
            "This Timeline challenge has already been completed by this player.",
        ),
        (
            "USERNAME_TAKEN",
            "USERNAME_TAKEN",
            "That username is already taken.",
        ),
        (
            "UNKNOWN",
            "CONFLICT",
            "The request conflicts with existing data.",
        ),
    ];

    for (input, code, message) in cases {
        assert_error(
            AppError::Conflict(input.to_owned()),
            StatusCode::CONFLICT,
            code,
            message,
        )
        .await;
    }
}

#[tokio::test]
async fn rate_limit_response_includes_retry_after_header() {
    let (status, headers, body) = response_parts(AppError::rate_limited("Wait.", 42)).await;

    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(headers.get(header::RETRY_AFTER).unwrap(), "42");
    assert_eq!(
        body,
        json!({ "error": { "code": "RATE_LIMITED", "message": "Wait." } })
    );
}

#[tokio::test]
async fn internal_errors_hide_implementation_details() {
    let json_error = serde_json::from_str::<Value>("{").expect_err("invalid JSON");
    let cases = [
        AppError::config("secret configuration detail"),
        AppError::Database(sqlx::Error::RowNotFound),
        AppError::Json(json_error),
    ];

    for error in cases {
        assert_error(
            error,
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "An unexpected error occurred.",
        )
        .await;
    }
}
