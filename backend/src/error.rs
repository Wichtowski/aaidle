use axum::{
    Json,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;
use tracing::error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("configuration error: {0}")]
    Config(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("forbidden: {0}")]
    Forbidden(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("unavailable: {0}")]
    Unavailable(String),
    #[error("request body too large")]
    PayloadTooLarge,
    #[error("rate limit exceeded: {message}")]
    TooManyRequests {
        message: String,
        retry_after_seconds: u64,
    },
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl AppError {
    pub fn config(message: impl Into<String>) -> Self {
        Self::Config(message.into())
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }

    pub fn rate_limited(message: impl Into<String>, retry_after_seconds: u64) -> Self {
        Self::TooManyRequests {
            message: message.into(),
            retry_after_seconds,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse<'a> {
    error: ErrorBody<'a>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody<'a> {
    code: &'a str,
    message: &'a str,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let retry_after_seconds = match &self {
            Self::TooManyRequests {
                retry_after_seconds,
                ..
            } => Some(*retry_after_seconds),
            _ => None,
        };
        let (status, code, message) = match &self {
            Self::Validation(message) => (
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                message.as_str(),
            ),
            Self::NotFound(message) => (StatusCode::NOT_FOUND, "NOT_FOUND", message.as_str()),
            Self::Unauthorized(message) => (
                StatusCode::UNAUTHORIZED,
                "UNAUTHENTICATED",
                message.as_str(),
            ),
            Self::Forbidden(message) => (StatusCode::FORBIDDEN, "FORBIDDEN", message.as_str()),
            Self::Conflict(message) => match message.as_str() {
                "DUPLICATE_GUESS" => (
                    StatusCode::CONFLICT,
                    "DUPLICATE_GUESS",
                    "This model has already been guessed.",
                ),
                "CHALLENGE_COMPLETED" => (
                    StatusCode::CONFLICT,
                    "CHALLENGE_COMPLETED",
                    "This challenge has already been completed by this player.",
                ),
                "REQUEST_ID_REUSED" => (
                    StatusCode::CONFLICT,
                    "REQUEST_ID_REUSED",
                    "This request ID was used for a different guess.",
                ),
                "ATTEMPT_LIMIT_REACHED" => (
                    StatusCode::CONFLICT,
                    "ATTEMPT_LIMIT_REACHED",
                    "Every available answer for this challenge has already been guessed.",
                ),
                "TIMELINE_ATTEMPT_LIMIT_REACHED" => (
                    StatusCode::CONFLICT,
                    "ATTEMPT_LIMIT_REACHED",
                    "No Timeline submissions remain for this challenge.",
                ),
                "TIMELINE_CHALLENGE_COMPLETED" => (
                    StatusCode::CONFLICT,
                    "CHALLENGE_COMPLETED",
                    "This Timeline challenge has already been completed by this player.",
                ),
                "USERNAME_TAKEN" => (
                    StatusCode::CONFLICT,
                    "USERNAME_TAKEN",
                    "That username is already taken.",
                ),
                _ => (
                    StatusCode::CONFLICT,
                    "CONFLICT",
                    "The request conflicts with existing data.",
                ),
            },
            Self::Unavailable(message) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "SERVICE_UNAVAILABLE",
                message.as_str(),
            ),
            Self::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "PAYLOAD_TOO_LARGE",
                "The request body exceeds the 16 KB limit.",
            ),
            Self::TooManyRequests { message, .. } => (
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMITED",
                message.as_str(),
            ),
            Self::Config(_) | Self::Database(_) | Self::Json(_) => {
                error!(error = %self, "request failed with an internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "An unexpected error occurred.",
                )
            }
        };

        let mut response = (
            status,
            Json(ErrorResponse {
                error: ErrorBody { code, message },
            }),
        )
            .into_response();
        if let Some(seconds) = retry_after_seconds
            && let Ok(value) = HeaderValue::from_str(&seconds.to_string())
        {
            response.headers_mut().insert(header::RETRY_AFTER, value);
        }
        response
    }
}
