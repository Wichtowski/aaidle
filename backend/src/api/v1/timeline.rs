use std::{collections::BTreeSet, net::SocketAddr};

use axum::{
    Json,
    extract::{ConnectInfo, Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    domain::timeline::TimelineDifficulty,
    dto::{
        TimelineAnchorModel, TimelineAttemptRequest, TimelineAttemptResponse,
        TimelineChallengeResponse, TimelineGameResponse, TimelineLatestAttemptResponse,
        TimelineProgressResponse, TimelinePublicModel, TimelineSlotResponse,
    },
    error::{AppError, AppResult},
    progress,
    repository::timeline::{self, TimelineAttemptInput},
    state::AppState,
};

use super::{
    assert_csrf_or_bearer, assert_same_origin_or_bearer, current_utc_date, format_next_midnight,
    is_model_id, now_millis, optional_authenticated_user, parse_json_payload, parse_uuid,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TimelineGameQuery {
    player_id: Uuid,
}

pub(super) async fn game(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(difficulty): Path<String>,
    Query(query): Query<TimelineGameQuery>,
) -> AppResult<Json<TimelineGameResponse>> {
    let difficulty = TimelineDifficulty::parse(&difficulty)
        .ok_or_else(|| AppError::validation("Unknown Timeline difficulty."))?;
    let user = optional_authenticated_user(&state, &headers).await?;
    if user.as_ref().is_some_and(|user| user.disabled) {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    if difficulty == TimelineDifficulty::Hardcore {
        let user = user.as_ref().ok_or_else(|| {
            AppError::Unauthorized("Sign in to access this game mode.".to_owned())
        })?;
        if !crate::auth::has_hardcore_access(&state.db, &user.id).await? {
            return Err(AppError::Forbidden(
                "Hardcore access has not been unlocked for this account.".to_owned(),
            ));
        }
    }
    let player_id = match &user {
        Some(user) => {
            progress::canonical_player_id(&state.db, &user.id, query.player_id, now_millis())
                .await?
        }
        None => query.player_id,
    };
    let game = timeline::timeline_game(
        &state.db,
        &current_utc_date()?,
        difficulty,
        &state.config.daily_selection_secret,
        player_id,
    )
    .await?;
    let anchor_positions = game
        .challenge
        .anchor_positions
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    let slots = game
        .challenge
        .model_order
        .iter()
        .enumerate()
        .map(|(position, model)| TimelineSlotResponse {
            position,
            anchor: anchor_positions
                .contains(&position)
                .then(|| TimelineAnchorModel {
                    id: model.id.clone(),
                    name: model.name.clone(),
                    item_kind: model.item_kind.clone(),
                    categories: model.categories.clone(),
                    release_date: model.release_date.clone(),
                    year_annotation: model.year_annotation.clone(),
                }),
        })
        .collect();
    let movable_models = game
        .challenge
        .tray_order
        .iter()
        .map(|model_id| {
            game.challenge
                .model_order
                .iter()
                .find(|model| model.id == *model_id)
                .map(|model| TimelinePublicModel {
                    id: model.id.clone(),
                    name: model.name.clone(),
                    item_kind: model.item_kind.clone(),
                    categories: model.categories.clone(),
                    release_date: game.solved.then(|| model.release_date.clone()),
                    year_annotation: game.solved.then(|| model.year_annotation.clone()).flatten(),
                })
                .ok_or_else(|| AppError::Unavailable("Stored Timeline tray is invalid.".to_owned()))
        })
        .collect::<AppResult<Vec<_>>>()?;

    Ok(Json(TimelineGameResponse {
        challenge: TimelineChallengeResponse {
            id: game.challenge.id,
            date: game.challenge.challenge_date,
            difficulty: difficulty.as_str().to_owned(),
            expires_at: format_next_midnight()?,
        },
        slots,
        movable_models,
        progress: TimelineProgressResponse {
            solved: game.solved,
            attempt_limit: game.attempt_limit,
            attempts_remaining: game.attempts_remaining,
            latest_attempt: game
                .latest_attempt
                .map(|attempt| TimelineLatestAttemptResponse {
                    model_order: attempt.model_order,
                    placements: attempt.placements,
                    attempt_number: attempt.attempt_number,
                }),
        },
    }))
}

pub(super) async fn attempt(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    payload: Result<Json<TimelineAttemptRequest>, JsonRejection>,
) -> AppResult<Json<TimelineAttemptResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    if payload.model_order.is_empty()
        || payload.model_order.len() > crate::domain::timeline::TIMELINE_MAX_MODEL_COUNT
    {
        return Err(AppError::validation(
            "modelOrder must contain between 1 and 18 models",
        ));
    }
    if payload
        .model_order
        .iter()
        .any(|model_id| !is_model_id(model_id))
    {
        return Err(AppError::validation(
            "modelOrder contains an invalid model ID",
        ));
    }

    let user = optional_authenticated_user(&state, &headers).await?;
    if user.as_ref().is_some_and(|user| user.disabled) {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    if user.is_some() {
        assert_same_origin_or_bearer(&state, &headers)?;
        assert_csrf_or_bearer(&headers)?;
    }
    let player_id = match &user {
        Some(user) => {
            progress::canonical_player_id(&state.db, &user.id, payload.player_id, now_millis())
                .await?
        }
        None => payload.player_id,
    };
    let hardcore_access = match &user {
        Some(user) => crate::auth::has_hardcore_access(&state.db, &user.id).await?,
        None => false,
    };
    super::consume_guess_rate_limits(&state, &headers, Some(peer), player_id, challenge_id).await?;

    let result = timeline::process_timeline_attempt(
        &state.db,
        TimelineAttemptInput {
            challenge_id,
            player_id,
            user_id: user.map(|user| user.id),
            hardcore_access,
            request_id: payload.request_id,
            model_order: payload.model_order,
        },
    )
    .await?;
    Ok(Json(TimelineAttemptResponse {
        placements: result.placements,
        attempts_remaining: result.attempts_remaining,
    }))
}
