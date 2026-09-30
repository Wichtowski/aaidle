use axum::{
    Json,
    extract::{Extension, State},
    http::HeaderMap,
};
use time::OffsetDateTime;

use super::{AnonymousPlayerId, assists};
use crate::{
    error::AppResult,
    repository::streaks::{GameStreaks, game_streaks},
    state::AppState,
};

pub(super) async fn get(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(anonymous)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
) -> AppResult<Json<GameStreaks>> {
    let player = assists::player(&state, &headers, anonymous, false).await?;
    Ok(Json(
        game_streaks(&state.db, player, OffsetDateTime::now_utc().date()).await?,
    ))
}

#[cfg(test)]
mod tests;
