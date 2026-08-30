use std::{collections::BTreeSet, net::SocketAddr};

use axum::{
    Json,
    extract::{ConnectInfo, Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;
use time::{Date, macros::format_description};
use uuid::Uuid;

use crate::{
    domain::timeline::TimelineDifficulty,
    dto::{
        TimelineAnchorModel, TimelineAttemptRequest, TimelineAttemptResponse,
        TimelineChallengeResponse, TimelineGameResponse, TimelineGlobalLeaderboardResponse,
        TimelineGlobalRunPoint, TimelineLatestAttemptResponse, TimelineLeaderboardResponse,
        TimelineProgressResponse, TimelinePublicModel, TimelineSlotResponse,
        TimelineSpeedrunStartRequest, TimelineSpeedrunStartResponse,
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
    if difficulty == TimelineDifficulty::Speedrun && user.is_none() {
        return Err(AppError::Unauthorized(
            "Sign in to access this game mode.".to_owned(),
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
                .map(|model| {
                    let revealed = difficulty != TimelineDifficulty::Speedrun
                        || game.speedrun_started_at.is_some()
                        || game.solved;
                    TimelinePublicModel {
                        id: model.id.clone(),
                        name: if revealed {
                            model.name.clone()
                        } else {
                            "Covered card".to_owned()
                        },
                        item_kind: if revealed {
                            model.item_kind.clone()
                        } else {
                            "model".to_owned()
                        },
                        categories: if revealed {
                            model.categories.clone()
                        } else {
                            Vec::new()
                        },
                        release_date: game.solved.then(|| model.release_date.clone()),
                        year_annotation: game
                            .solved
                            .then(|| model.year_annotation.clone())
                            .flatten(),
                    }
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
            speedrun_started_at: game.speedrun_started_at,
            latest_attempt: game
                .latest_attempt
                .map(|attempt| TimelineLatestAttemptResponse {
                    model_order: attempt.model_order,
                    placements: attempt.placements,
                    attempt_number: attempt.attempt_number,
                    speedrun_time_ms: attempt.speedrun_time_ms,
                }),
        },
    }))
}

pub(super) async fn start(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    payload: Result<Json<TimelineSpeedrunStartRequest>, JsonRejection>,
) -> AppResult<Json<TimelineSpeedrunStartResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    let user = optional_authenticated_user(&state, &headers)
        .await?
        .filter(|user| !user.disabled)
        .ok_or_else(|| AppError::Unauthorized("Sign in to access this game mode.".to_owned()))?;
    assert_same_origin_or_bearer(&state, &headers)?;
    assert_csrf_or_bearer(&headers)?;
    let player_id =
        progress::canonical_player_id(&state.db, &user.id, payload.player_id, now_millis()).await?;
    let started_at = timeline::start_speedrun(&state.db, challenge_id, player_id).await?;
    Ok(Json(TimelineSpeedrunStartResponse { started_at }))
}

pub(super) async fn leaderboard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
) -> AppResult<Json<TimelineLeaderboardResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let user = optional_authenticated_user(&state, &headers).await?;
    let entries = timeline::timeline_leaderboard(
        &state.db,
        challenge_id,
        user.as_ref().map(|user| user.id.as_str()),
    )
    .await?;
    Ok(Json(TimelineLeaderboardResponse {
        challenge_date: sqlx::query_scalar::<_, String>(
            "SELECT challenge_date FROM timeline_challenges WHERE id = ?",
        )
        .bind(challenge_id.to_string())
        .fetch_one(&state.db)
        .await?,
        entries: entries
            .into_iter()
            .map(|entry| crate::dto::TimelineLeaderboardEntry {
                rank: entry.rank,
                display_name: entry.display_name,
                is_current_user: entry.is_current_user,
                submissions: entry.submissions,
                time_ms: entry.time_ms,
            })
            .collect(),
    }))
}

pub(super) async fn current_leaderboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<TimelineLeaderboardResponse>> {
    let challenge = timeline::ensure_timeline_challenge(
        &state.db,
        &current_utc_date()?,
        TimelineDifficulty::Speedrun,
        &state.config.daily_selection_secret,
    )
    .await?;
    let user = optional_authenticated_user(&state, &headers).await?;
    let entries = timeline::timeline_leaderboard(
        &state.db,
        challenge.id,
        user.as_ref().map(|user| user.id.as_str()),
    )
    .await?;
    Ok(Json(TimelineLeaderboardResponse {
        challenge_date: challenge.challenge_date,
        entries: entries
            .into_iter()
            .map(|entry| crate::dto::TimelineLeaderboardEntry {
                rank: entry.rank,
                display_name: entry.display_name,
                is_current_user: entry.is_current_user,
                submissions: entry.submissions,
                time_ms: entry.time_ms,
            })
            .collect(),
    }))
}

pub(super) async fn dated_leaderboard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(date): Path<String>,
) -> AppResult<Json<TimelineLeaderboardResponse>> {
    let date = parse_leaderboard_date(&date)?;
    let challenge_id = if date == current_utc_date()? {
        Some(
            timeline::ensure_timeline_challenge(
                &state.db,
                &date,
                TimelineDifficulty::Speedrun,
                &state.config.daily_selection_secret,
            )
            .await?
            .id,
        )
    } else {
        sqlx::query_scalar::<_, String>(
            "SELECT id FROM timeline_challenges WHERE challenge_date = ? AND difficulty = 'speedrun'",
        )
        .bind(&date)
        .fetch_optional(&state.db)
        .await?
        .map(|challenge_id| {
            Uuid::parse_str(&challenge_id).map_err(|_| {
                AppError::Unavailable("Stored Timeline challenge ID is invalid.".to_owned())
            })
        })
        .transpose()?
    };
    let Some(challenge_id) = challenge_id else {
        return Ok(Json(TimelineLeaderboardResponse {
            challenge_date: date,
            entries: Vec::new(),
        }));
    };
    let user = optional_authenticated_user(&state, &headers).await?;
    let entries = timeline::timeline_leaderboard(
        &state.db,
        challenge_id,
        user.as_ref().map(|user| user.id.as_str()),
    )
    .await?;
    Ok(Json(TimelineLeaderboardResponse {
        challenge_date: date,
        entries: entries.into_iter().map(map_leaderboard_entry).collect(),
    }))
}

pub(super) async fn global_leaderboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<TimelineGlobalLeaderboardResponse>> {
    let user = optional_authenticated_user(&state, &headers).await?;
    let leaderboard = timeline::timeline_global_leaderboard(
        &state.db,
        user.as_ref().map(|user| user.id.as_str()),
    )
    .await?;
    Ok(Json(TimelineGlobalLeaderboardResponse {
        fastest: leaderboard
            .fastest
            .into_iter()
            .map(map_global_leaderboard_entry)
            .collect(),
        average: leaderboard
            .average
            .into_iter()
            .map(map_global_leaderboard_entry)
            .collect(),
        completions: leaderboard
            .completions
            .into_iter()
            .map(map_global_leaderboard_entry)
            .collect(),
    }))
}

fn parse_leaderboard_date(value: &str) -> AppResult<String> {
    if value.len() != 8 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(AppError::validation("date must use YYYYMMDD format"));
    }
    let date = Date::parse(value, format_description!("[year][month][day]"))
        .map_err(|_| AppError::validation("date must be a valid YYYYMMDD date"))?;
    date.format(format_description!("[year]-[month]-[day]"))
        .map_err(|_| AppError::Unavailable("Timeline date could not be formatted.".to_owned()))
}

fn map_leaderboard_entry(
    entry: timeline::TimelineLeaderboardEntry,
) -> crate::dto::TimelineLeaderboardEntry {
    crate::dto::TimelineLeaderboardEntry {
        rank: entry.rank,
        display_name: entry.display_name,
        is_current_user: entry.is_current_user,
        submissions: entry.submissions,
        time_ms: entry.time_ms,
    }
}

fn map_global_leaderboard_entry(
    entry: timeline::TimelineGlobalLeaderboardEntry,
) -> crate::dto::TimelineGlobalLeaderboardEntry {
    crate::dto::TimelineGlobalLeaderboardEntry {
        rank: entry.rank,
        display_name: entry.display_name,
        is_current_user: entry.is_current_user,
        completed_speedruns: entry.completed_speedruns,
        average_time_ms: entry.average_time_ms,
        average_submissions: entry.average_submissions,
        fastest_time_ms: entry.fastest_time_ms,
        recent_runs: entry
            .recent_runs
            .into_iter()
            .map(|run| TimelineGlobalRunPoint {
                date: run.challenge_date,
                submissions: run.submissions,
                time_ms: run.time_ms,
            })
            .collect(),
    }
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
        speedrun_time_ms: result.speedrun_time_ms,
        placements: result.placements,
        attempts_remaining: result.attempts_remaining,
        revealed_models: result
            .revealed_models
            .into_iter()
            .map(|model| crate::dto::TimelinePublicModel {
                id: model.id,
                name: model.name,
                item_kind: model.item_kind,
                categories: model.categories,
                release_date: Some(model.release_date),
                year_annotation: model.year_annotation,
            })
            .collect(),
    }))
}
