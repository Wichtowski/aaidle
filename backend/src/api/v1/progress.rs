use axum::{
    Json,
    extract::{Query, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;

use crate::{
    dto::ProgressResponse,
    error::{AppError, AppResult},
    progress::{ProgressHistoryResponse, ProgressPreferencesUpdate, ProgressSyncRequest},
    state::AppState,
};

use super::{
    assert_csrf_or_bearer, assert_same_origin_or_bearer, authenticated_user, now_millis,
    parse_json_payload,
};

const PROGRESS_WRITES_PER_MINUTE: i64 = 60;
const PREFERENCE_WRITES_PER_MINUTE: i64 = 20;

#[derive(Deserialize)]
pub(super) struct HistoryQuery {
    game: Option<String>,
    category: String,
    page: Option<i64>,
}

pub(super) async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<([(&'static str, &'static str); 1], Json<ProgressResponse>)> {
    let user = authenticated_user(&state, &headers).await?;
    Ok((
        [("cache-control", "no-store")],
        Json(ProgressResponse {
            progress: crate::progress::load(&state.db, &user.id).await?,
        }),
    ))
}

pub(super) async fn put(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<ProgressSyncRequest>, JsonRejection>,
) -> AppResult<Response> {
    assert_same_origin_or_bearer(&state, &headers)?;
    assert_csrf_or_bearer(&headers)?;
    let user = authenticated_user(&state, &headers).await?;
    let subject = crate::auth::rate_limit_subject(&state.config.auth_secret, "progress", &user.id)?;
    if !crate::auth::consume_rate_limit(
        &state.db,
        "progress-sync",
        &subject,
        PROGRESS_WRITES_PER_MINUTE,
        60_000,
        now_millis(),
    )
    .await?
    {
        return Err(AppError::rate_limited(
            "Progress is being synchronized too frequently.",
            60,
        ));
    }
    let incoming = parse_json_payload(payload)?;
    crate::progress::synchronize(&state.db, &user.id, &incoming, now_millis()).await?;
    let return_minimal = headers.get("prefer").is_some_and(|value| {
        value.to_str().is_ok_and(|value| {
            value
                .split(',')
                .any(|preference| preference.trim().eq_ignore_ascii_case("return=minimal"))
        })
    });
    if return_minimal {
        return Ok((
            StatusCode::NO_CONTENT,
            [
                ("cache-control", "no-store"),
                ("preference-applied", "return=minimal"),
            ],
        )
            .into_response());
    }
    let progress = crate::progress::load(&state.db, &user.id)
        .await?
        .ok_or_else(|| {
            AppError::Unavailable("Synchronized progress could not be loaded.".to_owned())
        })?;
    Ok((
        [("cache-control", "no-store")],
        Json(ProgressResponse {
            progress: Some(progress),
        }),
    )
        .into_response())
}

pub(super) async fn preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<ProgressPreferencesUpdate>, JsonRejection>,
) -> AppResult<StatusCode> {
    assert_same_origin_or_bearer(&state, &headers)?;
    assert_csrf_or_bearer(&headers)?;
    let user = authenticated_user(&state, &headers).await?;
    let subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "preferences", &user.id)?;
    if !crate::auth::consume_rate_limit(
        &state.db,
        "progress-preferences",
        &subject,
        PREFERENCE_WRITES_PER_MINUTE,
        60_000,
        now_millis(),
    )
    .await?
    {
        return Err(AppError::rate_limited(
            "Preferences are being updated too frequently.",
            60,
        ));
    }
    let incoming = parse_json_payload(payload)?;
    crate::progress::update_preferences(&state.db, &user.id, &incoming, now_millis()).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HistoryQuery>,
) -> AppResult<(
    [(&'static str, &'static str); 1],
    Json<ProgressHistoryResponse>,
)> {
    let user = authenticated_user(&state, &headers).await?;
    Ok((
        [("cache-control", "no-store")],
        Json(
            crate::progress::history(
                &state.db,
                &user.id,
                query.game.as_deref().unwrap_or("classic"),
                &query.category,
                query.page.unwrap_or(1),
            )
            .await?,
        ),
    ))
}
