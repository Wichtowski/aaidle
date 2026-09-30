use super::{
    AnonymousPlayerId, assists, current_utc_date, optional_authenticated_user, parse_json_payload,
};
use crate::{
    domain::{daily_completion::DailyCompletionSummary, difficulty::Difficulty},
    error::AppResult,
    repository::daily_completion,
    state::AppState,
};
use axum::{
    Json,
    extract::{Extension, Path, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SeenRequest {
    tier: Option<Difficulty>,
    #[serde(default)]
    goat_seen: bool,
}

async fn date(state: &AppState, headers: &HeaderMap, date: &str) -> AppResult<String> {
    if date == "today" {
        current_utc_date()
    } else {
        super::history::requested_date(state, headers, Some(date)).await
    }
}

pub(super) async fn get(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(requested): Path<String>,
) -> AppResult<Json<DailyCompletionSummary>> {
    let date = date(&state, &headers, &requested).await?;
    let player = assists::player(&state, &headers, anonymous, false).await?;
    let user = optional_authenticated_user(&state, &headers).await?;
    Ok(Json(
        daily_completion::summary(
            &state.db,
            &date,
            player,
            user.as_ref().map(|u| u.id.as_str()),
        )
        .await?,
    ))
}

pub(super) async fn seen(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(requested): Path<String>,
    payload: Result<Json<SeenRequest>, JsonRejection>,
) -> AppResult<Json<DailyCompletionSummary>> {
    let payload = parse_json_payload(payload)?;
    let date = date(&state, &headers, &requested).await?;
    let player = assists::player(&state, &headers, anonymous, true).await?;
    let user = optional_authenticated_user(&state, &headers).await?;
    let user = user.as_ref().map(|u| u.id.as_str());
    let summary = daily_completion::summary(&state.db, &date, player, user).await?;
    daily_completion::mark_seen(
        &state.db,
        &summary,
        user,
        payload.tier,
        payload.goat_seen,
        super::now_millis(),
    )
    .await?;
    Ok(Json(
        daily_completion::summary(&state.db, &date, player, user).await?,
    ))
}

#[cfg(test)]
mod tests;
