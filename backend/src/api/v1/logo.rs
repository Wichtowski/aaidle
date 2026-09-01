use std::net::SocketAddr;

use axum::{
    Json,
    extract::{ConnectInfo, Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    dto::{
        LogoChallengeResponse, LogoGameResponse, LogoGuessHistoryEntryResponse,
        LogoGuessHistoryResponse, LogoGuessRequest, LogoGuessResponse, LogoProgressResponse,
    },
    error::{AppError, AppResult},
    repository,
    state::AppState,
};

use super::{current_utc_date, format_next_midnight, is_model_id, parse_json_payload, parse_uuid};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LogoPlayerQuery {
    player_id: Uuid,
}

pub(super) async fn game(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(difficulty): Path<String>,
    Query(query): Query<LogoPlayerQuery>,
) -> AppResult<Json<LogoGameResponse>> {
    let player_id = read_player_id(&state, &headers, query.player_id).await?;
    let game = repository::logo::game(
        &state.db,
        &state.logo,
        &current_utc_date()?,
        &difficulty,
        &state.config.daily_selection_secret,
        player_id,
    )
    .await?;
    let challenge_id = parse_uuid(&game.challenge.id, "Stored Logo challenge ID is invalid.")?;
    Ok(Json(LogoGameResponse {
        challenge: LogoChallengeResponse {
            id: challenge_id,
            date: game.challenge.challenge_date,
            mode: game.challenge.mode,
            difficulty,
            expires_at: format_next_midnight()?,
        },
        models: game.models,
        progress: progress_response(game.progress),
        global_completion_count: game.completion_count,
    }))
}

pub(super) async fn guess_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    Query(query): Query<LogoPlayerQuery>,
) -> AppResult<Json<LogoGuessHistoryResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let player_id = read_player_id(&state, &headers, query.player_id).await?;
    let history =
        repository::logo::history(&state.db, &state.logo, challenge_id, player_id).await?;
    Ok(Json(LogoGuessHistoryResponse {
        guesses: history
            .guesses
            .into_iter()
            .map(|guess| LogoGuessHistoryEntryResponse {
                model: guess.model,
                is_correct: guess.is_correct,
                attempt_number: guess.attempt_number,
            })
            .collect(),
        progress: progress_response(history.progress),
    }))
}

async fn read_player_id(
    state: &AppState,
    headers: &HeaderMap,
    requested_player_id: Uuid,
) -> AppResult<Uuid> {
    let user = super::optional_authenticated_user(state, headers).await?;
    if user.as_ref().is_some_and(|user| user.disabled) {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    match user {
        Some(user) => {
            crate::progress::canonical_player_id(
                &state.db,
                &user.id,
                requested_player_id,
                super::now_millis(),
            )
            .await
        }
        None => Ok(requested_player_id),
    }
}

pub(super) async fn guess(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    payload: Result<Json<LogoGuessRequest>, JsonRejection>,
) -> AppResult<Json<LogoGuessResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    if !is_model_id(&payload.guessed_model_id) {
        return Err(AppError::validation("guessedModelId is invalid"));
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
    let outcome = repository::logo::process_guess(
        &state.db,
        &state.logo,
        repository::logo::LogoGuessInput {
            challenge_id,
            player_id,
            user_id: user.as_ref().map(|user| user.id.clone()),
            request_id: payload.request_id,
            guessed_model_id: payload.guessed_model_id,
            attempt_number: payload.attempt_number,
        },
    )
    .await?;
    Ok(Json(LogoGuessResponse {
        guessed_model: outcome.guessed_model,
        is_correct: outcome.is_correct,
        attempt_number: outcome.attempt_number,
        progress: progress_response(outcome.progress),
        global_completion_count: outcome.completion_count,
        player_stats: outcome.player_stats,
    }))
}

fn progress_response(progress: repository::logo::LogoProgress) -> LogoProgressResponse {
    LogoProgressResponse {
        image_url: progress.image_url,
        focal_point: progress.focal_point,
        image_revision: progress.image_revision,
        maximum_image_revision: progress.maximum_image_revision,
        clues: progress.clues,
        solved: progress.solved,
        attribution: progress.attribution,
    }
}

#[cfg(test)]
mod tests;
