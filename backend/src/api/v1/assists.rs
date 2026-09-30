use axum::{
    Json,
    extract::{Extension, Path, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;
use uuid::Uuid;

use super::{
    AnonymousPlayerId, assert_csrf_or_bearer, assert_same_origin_or_bearer, now_millis,
    optional_authenticated_user, parse_json_payload, parse_uuid,
};
use crate::{
    error::{AppError, AppResult},
    repository::assists,
    state::AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ClassicHintRequest {
    column: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct TimelineAutoPlaceRequest {
    card_id: String,
}

async fn player(
    state: &AppState,
    headers: &HeaderMap,
    anonymous: Uuid,
    mutation: bool,
) -> AppResult<Uuid> {
    let user = optional_authenticated_user(state, headers).await?;
    if user.as_ref().is_some_and(|user| user.disabled) {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    if mutation {
        assert_same_origin_or_bearer(state, headers)?;
        if user.is_some() {
            assert_csrf_or_bearer(headers)?;
        }
    }
    match user {
        Some(user) => {
            crate::progress::canonical_player_id(&state.db, &user.id, anonymous, now_millis()).await
        }
        None => Ok(anonymous),
    }
}

pub(super) async fn classic_state(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<assists::ClassicAssistState>> {
    let id = parse_uuid(&id, "challengeId must be a UUID")?;
    let player = player(&state, &headers, anonymous, false).await?;
    Ok(Json(
        assists::classic_assists(&state.db, id, player, None).await?,
    ))
}

pub(super) async fn classic_hint(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(id): Path<String>,
    payload: Result<Json<ClassicHintRequest>, JsonRejection>,
) -> AppResult<Json<assists::ClassicAssistState>> {
    let id = parse_uuid(&id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    let player = player(&state, &headers, anonymous, true).await?;
    Ok(Json(
        assists::classic_assists(&state.db, id, player, Some(&payload.column)).await?,
    ))
}

pub(super) async fn timeline_state(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<assists::TimelineAssistState>> {
    let id = parse_uuid(&id, "challengeId must be a UUID")?;
    let player = player(&state, &headers, anonymous, false).await?;
    Ok(Json(
        assists::timeline_assists(&state.db, id, player, None).await?,
    ))
}

pub(super) async fn timeline_auto_place(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(id): Path<String>,
    payload: Result<Json<TimelineAutoPlaceRequest>, JsonRejection>,
) -> AppResult<Json<assists::TimelineAssistState>> {
    let id = parse_uuid(&id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    let player = player(&state, &headers, anonymous, true).await?;
    Ok(Json(
        assists::timeline_assists(&state.db, id, player, Some(&payload.card_id)).await?,
    ))
}

#[cfg(test)]
mod tests;
