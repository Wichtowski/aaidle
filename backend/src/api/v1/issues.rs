use axum::{
    Json,
    extract::{State, rejection::JsonRejection},
    http::HeaderMap,
};

use crate::{
    dto::{IssueReportRequest, IssueReportResponse},
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    assert_csrf_or_bearer, assert_same_origin_or_bearer, authenticated_user, now_millis,
    parse_json_payload,
};

const ISSUE_GAMES: [&str; 4] = ["classic", "emoji", "timeline", "logo"];

pub(super) async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<IssueReportRequest>, JsonRejection>,
) -> AppResult<Json<IssueReportResponse>> {
    assert_same_origin_or_bearer(&state, &headers)?;
    assert_csrf_or_bearer(&headers)?;
    let user = authenticated_user(&state, &headers).await?;
    let payload = parse_json_payload(payload)?;
    let game = payload.game.trim();
    if !ISSUE_GAMES.contains(&game) {
        return Err(AppError::validation(
            "game must be one of classic, emoji, timeline, or logo",
        ));
    }
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
    let subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "issue-report-user", &user.id)?;
    if !crate::auth::consume_rate_limit(
        &state.db,
        "issue-report",
        &subject,
        user.issue_report_limit,
        24 * 60 * 60 * 1_000,
        now_millis(),
    )
    .await?
    {
        return Err(AppError::rate_limited(
            "You have reached your issue report limit for today.",
            24 * 60 * 60,
        ));
    }
    Ok(Json(IssueReportResponse {
        url: crate::issues::create_report(&state.http, &state.config, title, description, game)
            .await?,
    }))
}
