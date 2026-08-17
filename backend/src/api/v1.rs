use axum::{
    Json, Router,
    extract::DefaultBodyLimit,
    extract::{Query, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use std::net::{IpAddr, SocketAddr};
use time::macros::format_description;
use time::{OffsetDateTime, format_description::FormatItem};
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::{
    dto::{AuthUserResponse, HealthResponse, ModelsResponse},
    error::{AppError, AppResult},
    repository,
    state::AppState,
};

const DATE_FORMAT: &[FormatItem<'static>] = format_description!("[year]-[month]-[day]");
const MAX_BODY_BYTES: usize = 16 * 1024;
const HEALTH_KEY_HEADER: &str = "x-aaidle-health-key";
pub(super) const CLASSIC_CHALLENGE_COMPLETION_CATEGORIES: [&str; 6] =
    ["llm", "cv", "nlp", "od", "classical-ml", "filters"];

mod admin;
mod auth;
mod classic;
mod emoji_clues;
mod issues;
mod progress;

pub fn router(state: AppState) -> Router {
    let request_id = HeaderName::from_static("x-request-id");
    Router::new()
        .route("/health", get(health))
        .route("/health/ready", get(ready))
        .route("/auth/register", post(auth::register))
        .route("/auth/password", post(auth::password_login))
        .route("/auth/password-reset", post(auth::password_reset))
        .route(
            "/auth/password-reset/verify",
            get(auth::password_reset_verify),
        )
        .route(
            "/auth/password-reset/complete",
            post(auth::password_reset_complete),
        )
        .route("/auth/email-verification", post(auth::email_verification))
        .route(
            "/auth/email-verification/verify",
            get(auth::email_verification_verify),
        )
        .route("/auth/account-deletion", post(auth::account_deletion))
        .route(
            "/auth/account-deletion/verify",
            get(auth::account_deletion_verify),
        )
        .route(
            "/auth/account-deletion/complete",
            post(auth::account_deletion_complete),
        )
        .route(
            "/auth/progress",
            get(progress::get)
                .put(progress::put)
                .layer(DefaultBodyLimit::max(1_000_000)),
        )
        .route("/auth/oauth/{provider}", get(auth::oauth_start))
        .route("/auth/oauth/{provider}/callback", get(auth::oauth_callback))
        .route("/auth/me", get(auth::me))
        .route("/auth/hardcore-status", get(auth::hardcore_status))
        .route("/auth/logout", post(auth::logout))
        .route("/issues", post(issues::create))
        .route("/admin/users", get(admin::users))
        .route(
            "/admin/users/{user_id}",
            get(admin::user_detail)
                .patch(admin::user_update)
                .delete(admin::delete_guess),
        )
        .route(
            "/admin/settings/hardcore-soundtrack",
            get(admin::hardcore_soundtrack).put(admin::update_hardcore_soundtrack),
        )
        .route("/public-config", get(admin::public_config))
        .route("/models", get(models))
        .route("/games/classic/{category}/{difficulty}", get(classic::game))
        .route("/games/classic/hardcore", get(classic::hardcore_game))
        .route(
            "/games/classic/hardcore/access",
            post(classic::hardcore_access),
        )
        .route(
            "/games/classic/challenges/{challenge_id}/guesses",
            post(classic::guess),
        )
        .route(
            "/games/classic/challenges/{challenge_id}/stats",
            get(classic::challenge_stats),
        )
        .route(
            "/games/classic/challenges/{challenge_id}/trajectory",
            post(classic::trajectory),
        )
        .route("/games/emoji-clues/{difficulty}", get(emoji_clues::game))
        .route(
            "/games/emoji-clues/challenges/{challenge_id}/guesses",
            post(emoji_clues::guess),
        )
        .route(
            "/games/emoji-clues/challenges/{challenge_id}/hints",
            get(emoji_clues::hints),
        )
        .route("/players/{player_id}/stats", get(classic::player_stats))
        .with_state(state.clone())
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CompressionLayer::new().br(true))
                .layer(TimeoutLayer::with_status_code(
                    StatusCode::REQUEST_TIMEOUT,
                    state.config.request_timeout,
                ))
                .layer(SetRequestIdLayer::new(request_id.clone(), MakeRequestUuid))
                .layer(PropagateRequestIdLayer::new(request_id))
                .layer(DefaultBodyLimit::max(MAX_BODY_BYTES)),
        )
}

async fn health(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !authorize_health_request(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    health_response(&state).into_response()
}

fn health_response(state: &AppState) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "aidle-api",
        api_version: "v1",
        version: state.config.release_version.clone(),
    })
}

async fn ready(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !authorize_health_request(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if let Err(error) = sqlx::query("SELECT 1").fetch_one(&state.db).await {
        return AppError::from(error).into_response();
    }
    health_response(&state).into_response()
}

fn authorize_health_request(state: &AppState, headers: &HeaderMap) -> bool {
    let provided_key = headers
        .get(HEALTH_KEY_HEADER)
        .map(|value| value.as_bytes())
        .unwrap_or_default();
    constant_time_eq(provided_key, state.config.health_key.as_bytes())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    for index in 0..left.len().max(right.len()) {
        difference |= usize::from(*left.get(index).unwrap_or(&0) ^ *right.get(index).unwrap_or(&0));
    }
    difference == 0
}

#[derive(Deserialize)]
struct ModelsQuery {
    cursor: Option<String>,
    limit: Option<u16>,
}

async fn models(
    State(state): State<AppState>,
    Query(query): Query<ModelsQuery>,
) -> AppResult<impl IntoResponse> {
    if query
        .cursor
        .as_deref()
        .is_some_and(|cursor| cursor.len() > 128)
    {
        return Err(AppError::validation(
            "cursor must not exceed 128 characters",
        ));
    }
    let limit = i64::from(query.limit.unwrap_or(50));
    if !(1..=100).contains(&limit) {
        return Err(AppError::validation("limit must be between 1 and 100"));
    }
    let (models, next_cursor) =
        repository::list_public_models(&state.db, query.cursor.as_deref(), limit).await?;
    Ok((
        [("cache-control", "public, max-age=300, s-maxage=3600")],
        Json(ModelsResponse {
            models,
            next_cursor,
        }),
    ))
}

pub(super) fn parse_uuid(value: &str, message: &str) -> AppResult<Uuid> {
    value.parse().map_err(|_| AppError::validation(message))
}

pub(super) fn is_model_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

pub(super) fn format_next_midnight() -> AppResult<String> {
    let tomorrow = OffsetDateTime::now_utc()
        .date()
        .next_day()
        .ok_or_else(|| AppError::Unavailable("Could not determine challenge expiry.".to_owned()))?;
    tomorrow
        .with_hms(0, 0, 0)
        .map_err(|_| AppError::Unavailable("Could not determine challenge expiry.".to_owned()))?
        .assume_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|_| AppError::Unavailable("Could not determine challenge expiry.".to_owned()))
}

pub(super) fn current_utc_date() -> AppResult<String> {
    OffsetDateTime::now_utc()
        .date()
        .format(DATE_FORMAT)
        .map_err(|_| AppError::Unavailable("Could not determine the current UTC date.".to_owned()))
}

pub(super) fn auth_user_response(user: crate::auth::SessionUser) -> AuthUserResponse {
    AuthUserResponse {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        email_verified: user.email_verified,
        permission: user.permission.as_str(),
        disabled: user.disabled,
    }
}

pub(super) async fn authenticated_user(
    state: &AppState,
    headers: &HeaderMap,
) -> AppResult<crate::auth::SessionUser> {
    crate::auth::user_for_session(&state.db, session_cookie(headers), now_millis())
        .await?
        .filter(|user| !user.disabled)
        .ok_or_else(|| AppError::Unauthorized("Sign in to access this game mode.".to_owned()))
}

pub(super) fn assert_same_origin(state: &AppState, headers: &HeaderMap) -> AppResult<()> {
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    if origin != Some(state.config.app_origin.as_str()) {
        return Err(AppError::Forbidden(
            "This request must come from the application origin.".to_owned(),
        ));
    }
    Ok(())
}

pub(super) fn session_cookie(headers: &HeaderMap) -> Option<&str> {
    cookie_value(headers, "aaidle_session")
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())?
        .split(';')
        .map(str::trim)
        .find_map(|entry| entry.strip_prefix(&format!("{name}=")))
}

pub(super) fn no_store_with_cookie(
    state: &AppState,
    token: String,
) -> AppResult<[(header::HeaderName, HeaderValue); 2]> {
    Ok([
        (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        (
            header::SET_COOKIE,
            cookie_header(state, &token, 30 * 24 * 60 * 60)?,
        ),
    ])
}

pub(super) fn cookie_header(state: &AppState, token: &str, max_age: i64) -> AppResult<HeaderValue> {
    named_cookie_header(state, "aaidle_session", token, max_age)
}

pub(super) fn named_cookie_header(
    state: &AppState,
    name: &str,
    value: &str,
    max_age: i64,
) -> AppResult<HeaderValue> {
    let secure = if state.config.secure_cookies {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "{name}={value}; Path=/; Max-Age={max_age}; SameSite=Lax; HttpOnly{secure}"
    ))
    .map_err(|_| AppError::config("session cookie could not be encoded"))
}

pub(super) fn now_millis() -> i64 {
    OffsetDateTime::now_utc()
        .unix_timestamp_nanos()
        .div_euclid(1_000_000) as i64
}

pub(super) fn redirect(
    state: &AppState,
    location: &str,
    cookie: Option<(&str, String, i64)>,
    status: StatusCode,
) -> AppResult<Response> {
    let location = if location.starts_with("http://") || location.starts_with("https://") {
        location.to_owned()
    } else {
        format!("{}{}", state.config.app_origin, location)
    };
    let mut headers = HeaderMap::new();
    headers.insert(
        header::LOCATION,
        HeaderValue::from_str(&location)
            .map_err(|_| AppError::validation("Invalid redirect location."))?,
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Some((name, value, max_age)) = cookie {
        headers.append(
            header::SET_COOKIE,
            named_cookie_header(state, name, &value, max_age)?,
        );
    }
    Ok((status, headers).into_response())
}

pub(super) async fn consume_auth_rate_limit(
    state: &AppState,
    headers: &HeaderMap,
    peer: Option<SocketAddr>,
    scope: &str,
    email: &str,
    limit: i64,
    window_millis: i64,
) -> AppResult<()> {
    let client_ip = client_ip_for_request(state.config.environment, headers, peer);
    let subject = crate::auth::rate_limit_subject(&state.config.auth_secret, &client_ip, email)?;
    if !crate::auth::consume_rate_limit(
        &state.db,
        scope,
        &subject,
        limit,
        window_millis,
        now_millis(),
    )
    .await?
    {
        return Err(AppError::TooManyRequests("Try again later.".to_owned()));
    }
    Ok(())
}

fn client_ip_for_request(
    environment: crate::config::AppEnvironment,
    headers: &HeaderMap,
    peer: Option<SocketAddr>,
) -> String {
    let trusted_proxy_ip = matches!(environment, crate::config::AppEnvironment::Production)
        .then(|| {
            headers
                .get("x-aaidle-client-ip")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.trim().parse::<IpAddr>().ok())
        })
        .flatten();

    trusted_proxy_ip
        .map(|value| value.to_string())
        .or_else(|| peer.map(|value| value.ip().to_string()))
        .unwrap_or_else(|| "unknown".to_owned())
}

pub(super) fn is_token(token: &str) -> bool {
    !token.is_empty()
        && token.len() <= 128
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

pub(super) fn parse_json_payload<T>(payload: Result<Json<T>, JsonRejection>) -> AppResult<T> {
    payload
        .map_err(|error| match error {
            JsonRejection::BytesRejection(_) => AppError::PayloadTooLarge,
            _ => AppError::validation("Request body must be valid JSON."),
        })
        .map(|payload| payload.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_known_modes_and_model_ids() {
        assert!(is_model_id("gpt-4o"));
        assert!(!is_model_id("gpt 4o"));
    }

    #[test]
    fn cloudflare_proxied_request_uses_caddys_normalized_client_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("cf-connecting-ip", HeaderValue::from_static("203.0.113.10"));
        headers.insert(
            "x-aaidle-client-ip",
            HeaderValue::from_static("203.0.113.10"),
        );

        assert_eq!(
            client_ip_for_request(
                crate::config::AppEnvironment::Production,
                &headers,
                Some("172.20.0.2:43210".parse().expect("Caddy peer")),
            ),
            "203.0.113.10"
        );
    }

    #[test]
    fn spoofed_forwarding_headers_are_ignored_without_caddys_header() {
        let mut headers = HeaderMap::new();
        headers.insert("cf-connecting-ip", HeaderValue::from_static("203.0.113.10"));
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("203.0.113.10, 198.51.100.10"),
        );

        assert_eq!(
            client_ip_for_request(
                crate::config::AppEnvironment::Production,
                &headers,
                Some("172.20.0.2:43210".parse().expect("direct peer")),
            ),
            "172.20.0.2"
        );
    }

    #[test]
    fn local_direct_request_uses_the_socket_peer_not_forwarded_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-aaidle-client-ip",
            HeaderValue::from_static("203.0.113.10"),
        );
        headers.insert("cf-connecting-ip", HeaderValue::from_static("203.0.113.11"));

        assert_eq!(
            client_ip_for_request(
                crate::config::AppEnvironment::Local,
                &headers,
                Some("127.0.0.1:43210".parse().expect("local peer")),
            ),
            "127.0.0.1"
        );
    }

    #[test]
    fn missing_cf_connecting_ip_falls_back_to_the_socket_peer() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.10"));

        assert_eq!(
            client_ip_for_request(
                crate::config::AppEnvironment::Production,
                &headers,
                Some("172.20.0.2:43210".parse().expect("direct peer")),
            ),
            "172.20.0.2"
        );
    }
}
