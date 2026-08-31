use axum::{
    Json,
    extract::{ConnectInfo, Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;
use std::net::SocketAddr;
use uuid::Uuid;

use crate::{
    dto::{
        EmojiDifficultyChallenge, EmojiDifficultyGameResponse, EmojiDifficultyGuessHistoryResponse,
        EmojiDifficultyGuessRequest, EmojiDifficultyGuessResponse, EmojiDifficultyHintsResponse,
    },
    error::{AppError, AppResult},
    repository,
    state::AppState,
};

use super::{
    authenticated_user, current_utc_date, format_next_midnight, is_model_id, parse_json_payload,
    parse_uuid,
};

pub(super) async fn game(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(difficulty): Path<String>,
) -> AppResult<Json<EmojiDifficultyGameResponse>> {
    if repository::emoji::difficulty_pool(&difficulty).is_none() {
        return Err(AppError::validation("Unknown Emoji difficulty."));
    }
    if difficulty == "hardcore" {
        let user = authenticated_user(&state, &headers).await?;
        if !crate::auth::has_hardcore_access(&state.db, &user.id).await? {
            return Err(AppError::Forbidden(
                "Hardcore access has not been unlocked for this account.".to_owned(),
            ));
        }
    }
    let game = repository::emoji::game(
        &state.db,
        &state.emoji,
        &current_utc_date()?,
        &difficulty,
        &state.config.daily_selection_secret,
    )
    .await?;
    Ok(Json(EmojiDifficultyGameResponse {
        challenge: EmojiDifficultyChallenge {
            id: parse_uuid(&game.challenge.id, "Stored challenge ID is invalid.")?,
            date: game.challenge.challenge_date,
            mode: game.challenge.mode,
            difficulty,
            expires_at: format_next_midnight()?,
            clues: game.clues,
            maximum_clues: game.maximum_clues,
        },
        entities: game
            .entities
            .into_iter()
            .map(emoji_entity_response)
            .collect(),
        global_completion_count: game.completion_count,
    }))
}

#[derive(Deserialize)]
pub(super) struct EmojiHintsQuery {
    #[serde(rename = "playerId")]
    player_id: Uuid,
}

pub(super) async fn hints(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    Query(query): Query<EmojiHintsQuery>,
) -> AppResult<Json<EmojiDifficultyHintsResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    Ok(Json(EmojiDifficultyHintsResponse {
        clues: repository::emoji::hints(&state.db, &state.emoji, challenge_id, query.player_id)
            .await?,
    }))
}

pub(super) async fn guess_history(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    Query(query): Query<EmojiHintsQuery>,
) -> AppResult<Json<EmojiDifficultyGuessHistoryResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    Ok(Json(EmojiDifficultyGuessHistoryResponse {
        guesses: repository::emoji::guess_history(
            &state.db,
            &state.emoji,
            challenge_id,
            query.player_id,
        )
        .await?,
        clues: repository::emoji::hints(&state.db, &state.emoji, challenge_id, query.player_id)
            .await?,
    }))
}

pub(super) async fn guess(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    payload: Result<Json<EmojiDifficultyGuessRequest>, JsonRejection>,
) -> AppResult<Json<EmojiDifficultyGuessResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    if !is_model_id(&payload.guessed_entity_id) {
        return Err(AppError::validation("guessedEntityId is invalid"));
    }
    if payload.attempt_number == 0 {
        return Err(AppError::validation("attemptNumber must be positive"));
    }
    let user = super::optional_authenticated_user(&state, &headers).await?;
    if user.as_ref().is_some_and(|user| user.disabled) {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    if user.is_some() {
        super::assert_same_origin_or_bearer(&state, &headers)?;
        super::assert_csrf_or_bearer(&headers)?;
    }
    let player_id = match &user {
        Some(user) => {
            crate::progress::canonical_player_id(
                &state.db,
                &user.id,
                payload.player_id,
                super::now_millis(),
            )
            .await?
        }
        None => payload.player_id,
    };
    super::consume_guess_rate_limits(&state, &headers, Some(peer), player_id, challenge_id).await?;
    let outcome = repository::emoji::process_guess(
        &state.db,
        &state.emoji,
        repository::emoji::VisualGuessInput {
            challenge_id,
            player_id,
            user_id: user.as_ref().map(|user| user.id.clone()),
            request_id: payload.request_id,
            guessed_entity_id: payload.guessed_entity_id,
            attempt_number: payload.attempt_number,
        },
    )
    .await?;
    Ok(Json(EmojiDifficultyGuessResponse {
        entity: emoji_entity_response(outcome.entity),
        is_correct: outcome.is_correct,
        attempt_number: outcome.attempt_number,
        global_completion_count: outcome.completion_count,
        player_stats: outcome.player_stats,
        clues: outcome.clues,
    }))
}

fn emoji_entity_response(
    entity: crate::domain::emoji::VisualClueEntity,
) -> crate::dto::VisualClueEntityResponse {
    crate::dto::VisualClueEntityResponse {
        id: entity.id,
        name: entity.name,
        aliases: entity.aliases,
        entity_kind: entity.entity_kind.as_str().to_owned(),
    }
}

#[cfg(test)]
mod tests;
