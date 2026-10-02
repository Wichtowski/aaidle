use std::net::SocketAddr;

use axum::{
    Json,
    extract::{ConnectInfo, Extension, Path, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;

use super::{
    AnonymousPlayerId, consume_guess_rate_limits, parse_json_payload, parse_uuid, request_player,
};
use crate::{error::AppResult, repository::assists, state::AppState};

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

pub(super) async fn classic_state(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<assists::ClassicAssistState>> {
    let id = parse_uuid(&id, "challengeId must be a UUID")?;
    let player = request_player(&state, &headers, anonymous, false).await?;
    Ok(Json(
        assists::classic_assists(&state.db, id, player, None).await?,
    ))
}

pub(super) async fn classic_hint(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    payload: Result<Json<ClassicHintRequest>, JsonRejection>,
) -> AppResult<Json<assists::ClassicAssistState>> {
    let id = parse_uuid(&id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    let player = request_player(&state, &headers, anonymous, true).await?;
    consume_guess_rate_limits(&state, &headers, Some(peer), player, id).await?;
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
    let player = request_player(&state, &headers, anonymous, false).await?;
    Ok(Json(
        assists::timeline_assists(&state.db, id, player, None).await?,
    ))
}

pub(super) async fn timeline_auto_place(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    payload: Result<Json<TimelineAutoPlaceRequest>, JsonRejection>,
) -> AppResult<Json<assists::TimelineAssistState>> {
    let id = parse_uuid(&id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    let player = request_player(&state, &headers, anonymous, true).await?;
    consume_guess_rate_limits(&state, &headers, Some(peer), player, id).await?;
    Ok(Json(
        assists::timeline_assists(&state.db, id, player, Some(&payload.card_id)).await?,
    ))
}

#[cfg(test)]
mod tests;
