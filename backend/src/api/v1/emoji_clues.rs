use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    dto::{
        EmojiCluesChallenge, EmojiCluesGameResponse, EmojiCluesGuessHistoryResponse,
        EmojiCluesGuessRequest, EmojiCluesGuessResponse, EmojiCluesHintsResponse,
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
) -> AppResult<Json<EmojiCluesGameResponse>> {
    if repository::visual_clues::difficulty_pool(&difficulty).is_none() {
        return Err(AppError::validation("Unknown Emoji Clues difficulty."));
    }
    if difficulty == "hardcore" {
        let user = authenticated_user(&state, &headers).await?;
        if !crate::auth::has_hardcore_access(&state.db, &user.id).await? {
            return Err(AppError::Forbidden(
                "Hardcore access has not been unlocked for this account.".to_owned(),
            ));
        }
    }
    let game = repository::visual_clues::game(
        &state.db,
        &state.visual_clues,
        &current_utc_date()?,
        &difficulty,
        &state.config.daily_selection_secret,
    )
    .await?;
    Ok(Json(EmojiCluesGameResponse {
        challenge: EmojiCluesChallenge {
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
            .map(emoji_clues_entity_response)
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
) -> AppResult<Json<EmojiCluesHintsResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    Ok(Json(EmojiCluesHintsResponse {
        clues: repository::visual_clues::hints(
            &state.db,
            &state.visual_clues,
            challenge_id,
            query.player_id,
        )
        .await?,
    }))
}

pub(super) async fn guess_history(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    Query(query): Query<EmojiHintsQuery>,
) -> AppResult<Json<EmojiCluesGuessHistoryResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    Ok(Json(EmojiCluesGuessHistoryResponse {
        guesses: repository::visual_clues::guess_history(
            &state.db,
            &state.visual_clues,
            challenge_id,
            query.player_id,
        )
        .await?,
        clues: repository::visual_clues::hints(
            &state.db,
            &state.visual_clues,
            challenge_id,
            query.player_id,
        )
        .await?,
    }))
}

pub(super) async fn guess(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    payload: Result<Json<EmojiCluesGuessRequest>, JsonRejection>,
) -> AppResult<Json<EmojiCluesGuessResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    if !is_model_id(&payload.guessed_entity_id) {
        return Err(AppError::validation("guessedEntityId is invalid"));
    }
    if !(1..=100).contains(&payload.attempt_number) {
        return Err(AppError::validation(
            "attemptNumber must be between 1 and 100",
        ));
    }
    let outcome = repository::visual_clues::process_guess(
        &state.db,
        &state.visual_clues,
        repository::visual_clues::VisualGuessInput {
            challenge_id,
            player_id: payload.player_id,
            request_id: payload.request_id,
            guessed_entity_id: payload.guessed_entity_id,
            attempt_number: payload.attempt_number,
        },
    )
    .await?;
    Ok(Json(EmojiCluesGuessResponse {
        entity: emoji_clues_entity_response(outcome.entity),
        is_correct: outcome.is_correct,
        attempt_number: outcome.attempt_number,
        global_completion_count: outcome.completion_count,
        player_stats: outcome.player_stats,
        clues: outcome.clues,
    }))
}

fn emoji_clues_entity_response(
    entity: crate::domain::visual_clues::VisualClueEntity,
) -> crate::dto::VisualClueEntityResponse {
    crate::dto::VisualClueEntityResponse {
        id: entity.id,
        name: entity.name,
        aliases: entity.aliases,
        entity_kind: entity.entity_kind.as_str().to_owned(),
    }
}
