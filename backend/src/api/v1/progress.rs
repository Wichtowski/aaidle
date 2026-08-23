use axum::{
    Json,
    extract::{Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;

use crate::{
    dto::ProgressResponse,
    error::{AppError, AppResult},
    progress::{ProgressHistoryResponse, ProgressSyncRequest},
    state::AppState,
};

use super::{
    assert_csrf_or_bearer, assert_same_origin_or_bearer, authenticated_user, now_millis,
    parse_json_payload,
};

const PROGRESS_WRITES_PER_MINUTE: i64 = 60;

#[derive(Deserialize)]
pub(super) struct HistoryQuery {
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
) -> AppResult<([(&'static str, &'static str); 1], Json<ProgressResponse>)> {
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
    let progress =
        crate::progress::synchronize(&state.db, &user.id, &incoming, now_millis()).await?;
    Ok((
        [("cache-control", "no-store")],
        Json(ProgressResponse {
            progress: Some(progress),
        }),
    ))
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
                &query.category,
                query.page.unwrap_or(1),
            )
            .await?,
        ),
    ))
}
