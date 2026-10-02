use axum::{
    Json,
    extract::{Extension, State},
    http::HeaderMap,
    response::IntoResponse,
};
use time::OffsetDateTime;

use super::{AnonymousPlayerId, request_player};
use crate::{error::AppResult, repository::streaks::game_streaks, state::AppState};

pub(super) async fn get(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let player = request_player(&state, &headers, anonymous, false).await?;
    Ok((
        [("cache-control", "no-store")],
        Json(game_streaks(&state.db, player, OffsetDateTime::now_utc().date()).await?),
    ))
}

#[cfg(test)]
mod tests;
