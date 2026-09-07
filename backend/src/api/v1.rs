use axum::{
    Json, Router,
    extract::DefaultBodyLimit,
    extract::{Query, Request, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, patch, post, put},
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
const GUESS_PLAYER_CHALLENGE_PER_MINUTE: i64 = 400;
const GUESS_PLAYER_PER_HOUR: i64 = 1_700;
const GUESS_IP_PER_MINUTE: i64 = 600;
const GUESS_IP_PER_HOUR: i64 = 5_000;
pub(super) const CLASSIC_CHALLENGE_COMPLETION_CATEGORIES: [&str; 6] =
    ["llm", "cv", "nlp", "od", "classical-ml", "filters"];

#[derive(Clone, Copy)]
pub(super) struct AnonymousPlayerId(pub Uuid);

mod admin;
mod auth;
mod classic;
mod emoji;
mod issues;
mod logo;
mod progress;
mod timeline;

pub fn router(state: AppState) -> Router {
    let request_id = HeaderName::from_static("x-request-id");
    Router::new()
        .route("/health", get(health))
        .route("/health/ready", get(ready))
        .route("/auth/register", post(auth::register))
        .route("/auth/username", put(auth::update_username))
        .route("/auth/password", post(auth::password_login))
        .route("/auth/token", post(auth::api_token))
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
            "/auth/account-deletion/status",
            get(auth::account_deletion_status),
        )
        .route(
            "/auth/account-deletion/complete",
            post(auth::account_deletion_complete),
        )
        .route(
            "/auth/progress",
            get(progress::get).put(progress::put_route),
        )
        .route("/auth/progress/preferences", patch(progress::preferences))
        .route("/auth/progress/history", get(progress::history))
        .route("/auth/oauth/{provider}", get(auth::oauth_start))
        .route("/auth/oauth/{provider}/callback", get(auth::oauth_callback))
        .route("/auth/me", get(auth::me))
        .route("/auth/hardcore-status", get(auth::hardcore_status))
        .route("/auth/logout", post(auth::logout))
        .route("/issues", post(issues::create))
        .route(
            "/issues/limit-request",
            post(issues::request_limit_increase),
        )
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
            get(classic::guess_history).post(classic::guess),
        )
        .route(
            "/games/classic/challenges/{challenge_id}/stats",
            get(classic::challenge_stats),
        )
        .route(
            "/games/classic/challenges/{challenge_id}/trajectory",
            post(classic::trajectory),
        )
        .route("/games/emoji/{difficulty}", get(emoji::game))
        .route("/games/logo/{difficulty}", get(logo::game_route))
        .route("/games/timeline/{difficulty}", get(timeline::game_route))
        .route(
            "/games/timeline/challenges/{challenge_id}/attempts",
            post(timeline::attempt_route),
        )
        .route(
            "/games/timeline/challenges/{challenge_id}/start",
            post(timeline::start_route),
        )
        .route(
            "/games/timeline/challenges/{challenge_id}/give-up",
            post(timeline::give_up_route),
        )
        .route(
            "/games/timeline/challenges/{challenge_id}/leaderboard",
            get(timeline::leaderboard),
        )
        .route(
            "/games/timeline/leaderboard",
            get(timeline::current_leaderboard),
        )
        .route(
            "/games/timeline/leaderboard/global",
            get(timeline::global_leaderboard),
        )
        .route(
            "/games/timeline/leaderboard/{date}",
            get(timeline::dated_leaderboard),
        )
        .route(
            "/games/emoji/challenges/{challenge_id}/guesses",
            get(emoji::guess_history_route).post(emoji::guess_route),
        )
        .route(
            "/games/emoji/challenges/{challenge_id}/hints",
            get(emoji::hints_route),
        )
        .route(
            "/games/logo/challenges/{challenge_id}/guesses",
            get(logo::guess_history_route).post(logo::guess_route),
        )
        .route(
            "/games/logo/challenges/{challenge_id}/image",
            get(logo::image_route),
        )
        .route("/players/{player_id}/stats", get(classic::player_stats))
        .with_state(state.clone())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            anonymous_player_identity,
        ))
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

async fn anonymous_player_identity(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    if !path.starts_with("/games/") && path != "/auth/progress" {
        return next.run(request).await;
    }
    let now = now_millis();
    let existing = cookie_value(request.headers(), "aaidle_player");
    let player_id = match existing {
        Some(token) => {
            match crate::auth::verify_anonymous_player_token(&state.config.auth_secret, token, now)
            {
                Ok(Some(player_id)) => player_id,
                Ok(None) => Uuid::new_v4(),
                Err(error) => return error.into_response(),
            }
        }
        None => Uuid::new_v4(),
    };
    let issue_cookie = existing.is_none_or(|token| {
        !matches!(
            crate::auth::verify_anonymous_player_token(&state.config.auth_secret, token, now),
            Ok(Some(_))
        )
    });
    request
        .extensions_mut()
        .insert(AnonymousPlayerId(player_id));
    let mut response = next.run(request).await;
    if issue_cookie {
        let token = match crate::auth::create_anonymous_player_token(
            &state.config.auth_secret,
            player_id,
            now,
        ) {
            Ok(token) => token,
            Err(error) => return error.into_response(),
        };
        let cookie = match anonymous_player_cookie_header(&state, &token) {
            Ok(cookie) => cookie,
            Err(error) => return error.into_response(),
        };
        response.headers_mut().append(header::SET_COOKIE, cookie);
    }
    response
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
    let disabled_reason = user.disabled.then_some(user.disabled_reason).flatten();
    AuthUserResponse {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        username: user.username,
        email_verified: user.email_verified,
        permission: user.permission.as_str(),
        disabled: user.disabled,
        disabled_reason,
    }
}

pub(super) async fn optional_authenticated_user(
    state: &AppState,
    headers: &HeaderMap,
) -> AppResult<Option<crate::auth::SessionUser>> {
    if let Some(token) = bearer_token(headers) {
        crate::auth::user_for_access_token(&state.db, Some(token), &state.config).await
    } else {
        crate::auth::user_for_session(&state.db, session_cookie(headers), now_millis()).await
    }
}

pub(super) async fn authenticated_user(
    state: &AppState,
    headers: &HeaderMap,
) -> AppResult<crate::auth::SessionUser> {
    optional_authenticated_user(state, headers)
        .await?
        .filter(|user| !user.disabled)
        .ok_or_else(|| AppError::Unauthorized("Sign in to access this game mode.".to_owned()))
}

pub(super) fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
}

pub(super) fn assert_same_origin_or_bearer(state: &AppState, headers: &HeaderMap) -> AppResult<()> {
    if bearer_token(headers).is_some() {
        Ok(())
    } else {
        assert_same_origin(state, headers)
    }
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

pub(super) fn assert_csrf(headers: &HeaderMap) -> AppResult<()> {
    let cookie = cookie_value(headers, "aaidle_csrf").unwrap_or_default();
    let header = headers
        .get("x-aaidle-csrf-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if cookie.is_empty() || !constant_time_eq(cookie.as_bytes(), header.as_bytes()) {
        return Err(AppError::Forbidden(
            "The CSRF token is invalid or missing.".to_owned(),
        ));
    }
    Ok(())
}

pub(super) fn assert_csrf_or_bearer(headers: &HeaderMap) -> AppResult<()> {
    if bearer_token(headers).is_some() {
        Ok(())
    } else {
        assert_csrf(headers)
    }
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

pub(super) fn no_store_with_cookie(state: &AppState, token: String) -> AppResult<HeaderMap> {
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.append(
        header::SET_COOKIE,
        cookie_header(state, &token, 30 * 24 * 60 * 60)?,
    );
    headers.append(
        header::SET_COOKIE,
        csrf_cookie_header(state, &crate::auth::random_token(), 30 * 24 * 60 * 60)?,
    );
    Ok(headers)
}

pub(super) fn cookie_header(state: &AppState, token: &str, max_age: i64) -> AppResult<HeaderValue> {
    named_cookie_header(state, "aaidle_session", token, max_age)
}

fn anonymous_player_cookie_header(state: &AppState, token: &str) -> AppResult<HeaderValue> {
    let secure = if state.config.secure_cookies {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "aaidle_player={token}; Path=/api/v1; Max-Age={}; SameSite=Strict; HttpOnly{secure}",
        crate::auth::ANONYMOUS_PLAYER_LIFETIME_SECONDS,
    ))
    .map_err(|_| AppError::config("anonymous player cookie could not be encoded"))
}

pub(super) fn csrf_cookie_header(
    state: &AppState,
    token: &str,
    max_age: i64,
) -> AppResult<HeaderValue> {
    let secure = if state.config.secure_cookies {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "aaidle_csrf={token}; Path=/; Max-Age={max_age}; SameSite=Strict{secure}"
    ))
    .map_err(|_| AppError::config("CSRF cookie could not be encoded"))
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
        return Err(AppError::rate_limited(
            "Try again later.",
            (window_millis / 1_000).max(1) as u64,
        ));
    }
    Ok(())
}

pub(super) async fn consume_guess_rate_limits(
    state: &AppState,
    headers: &HeaderMap,
    peer: Option<SocketAddr>,
    player_id: Uuid,
    challenge_id: Uuid,
) -> AppResult<()> {
    let client_ip = client_ip_for_request(state.config.environment, headers, peer);
    let rate_limit_ip = guess_rate_limit_ip(&client_ip);
    let ip_subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "guess-ip", &rate_limit_ip)?;
    let player_subject = crate::auth::rate_limit_subject(
        &state.config.auth_secret,
        "guess-player",
        &player_id.to_string(),
    )?;
    let player_challenge_subject = crate::auth::rate_limit_subject(
        &state.config.auth_secret,
        &player_id.to_string(),
        &challenge_id.to_string(),
    )?;
    let now = now_millis();
    for (scope, subject, limit, window_millis) in [
        ("guess-ip-minute", &ip_subject, GUESS_IP_PER_MINUTE, 60_000),
        ("guess-ip-hour", &ip_subject, GUESS_IP_PER_HOUR, 3_600_000),
        (
            "guess-player-challenge-minute",
            &player_challenge_subject,
            GUESS_PLAYER_CHALLENGE_PER_MINUTE,
            60_000,
        ),
        (
            "guess-player-hour",
            &player_subject,
            GUESS_PLAYER_PER_HOUR,
            3_600_000,
        ),
    ] {
        if !crate::auth::consume_rate_limit(&state.db, scope, subject, limit, window_millis, now)
            .await?
        {
            return Err(AppError::rate_limited(
                "Guesses are being submitted too frequently.",
                (window_millis / 1_000) as u64,
            ));
        }
    }
    Ok(())
}

fn guess_rate_limit_ip(client_ip: &str) -> String {
    match client_ip.parse::<IpAddr>() {
        Ok(IpAddr::V6(address)) => IpAddr::V6(std::net::Ipv6Addr::from(
            u128::from(address) & (u128::MAX << 64),
        ))
        .to_string(),
        Ok(address) => address.to_string(),
        Err(_) => client_ip.to_owned(),
    }
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
mod test_support;
#[cfg(test)]
mod tests;
