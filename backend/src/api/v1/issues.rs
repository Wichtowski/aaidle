use std::net::SocketAddr;

use axum::{
    Json,
    extract::{ConnectInfo, State, rejection::JsonRejection},
    http::HeaderMap,
};

use crate::{
    dto::{IssueReportRequest, IssueReportResponse},
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    assert_csrf_or_bearer, assert_same_origin_or_bearer, authenticated_user,
    consume_auth_rate_limit, parse_json_payload,
};

pub(super) async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    payload: Result<Json<IssueReportRequest>, JsonRejection>,
) -> AppResult<Json<IssueReportResponse>> {
    assert_same_origin_or_bearer(&state, &headers)?;
    assert_csrf_or_bearer(&headers)?;
    let user = authenticated_user(&state, &headers).await?;
    let payload = parse_json_payload(payload)?;
    let title = payload.title.trim();
    let description = payload.description.trim();
    if !(8..=120).contains(&title.len()) {
        return Err(AppError::validation(
            "title must be between 8 and 120 characters",
        ));
    }
    if !(20..=5_000).contains(&description.len()) {
        return Err(AppError::validation(
            "description must be between 20 and 5000 characters",
        ));
    }
    consume_auth_rate_limit(
        &state,
        &headers,
        Some(peer),
        "issue-report",
        &user.email,
        3,
        60 * 60 * 1_000,
    )
    .await?;
    Ok(Json(IssueReportResponse {
        url: crate::issues::create_report(&state.http, &state.config, title, description).await?,
    }))
}
