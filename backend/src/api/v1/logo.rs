use std::net::SocketAddr;

use axum::{
    Json,
    body::Body,
    extract::{ConnectInfo, Extension, Path, Query, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, header},
    response::Response,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    dto::{
        LogoChallengeResponse, LogoClueResponse, LogoGameResponse, LogoGuessHistoryEntryResponse,
        LogoGuessHistoryResponse, LogoGuessRequest, LogoGuessResponse, LogoProgressResponse,
    },
    error::{AppError, AppResult},
    repository,
    state::AppState,
};

use super::{
    AnonymousPlayerId, current_utc_date, format_next_midnight, is_model_id, parse_json_payload,
    parse_uuid,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LogoPlayerQuery {
    player_id: Uuid,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct LogoImageQuery {
    v: String,
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
        progress: progress_response(challenge_id, game.progress),
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
        progress: progress_response(challenge_id, history.progress),
    }))
}

pub(super) async fn image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    Query(query): Query<LogoPlayerQuery>,
    requested_variant: Option<String>,
) -> AppResult<Response> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let player_id = read_player_id(&state, &headers, query.player_id).await?;
    let is_current = sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM logo_challenges WHERE id = ? AND challenge_date = ?)",
    )
    .bind(challenge_id.to_string())
    .bind(current_utc_date()?)
    .fetch_one(&state.db)
    .await?
        != 0;
    if !is_current {
        return Err(AppError::NotFound(
            "Logo image challenge not found.".to_owned(),
        ));
    }
    let history =
        repository::logo::history(&state.db, &state.logo, challenge_id, player_id).await?;
    let mut progress = history.progress;
    let clue_index = requested_variant
        .as_deref()
        .and_then(|v| v.strip_prefix("clue-"));
    if let Some(index) = clue_index {
        let clue = index
            .parse::<usize>()
            .ok()
            .and_then(|index| progress.clues.get(index))
            .filter(|clue| clue.kind == "image")
            .and_then(|clue| clue.asset.as_ref())
            .ok_or_else(|| AppError::NotFound("Logo image variant not found.".to_owned()))?;
        progress.image_url = clue.clone();
        progress.solved = true;
    }
    let authorized_variant = if progress.solved {
        "solved".to_owned()
    } else {
        progress.image_revision.to_string()
    };
    if clue_index.is_none()
        && requested_variant
            .as_deref()
            .is_some_and(|variant| variant != authorized_variant)
    {
        return Err(AppError::NotFound(
            "Logo image variant not found.".to_owned(),
        ));
    }
    let image = state
        .logo_images
        .image(
            &challenge_id.to_string(),
            &progress.image_url,
            progress.reveal,
            progress.image_revision,
            progress.solved,
        )
        .await?;
    let now = time::OffsetDateTime::now_utc();
    let next_midnight = now
        .date()
        .next_day()
        .and_then(|date| date.with_hms(0, 0, 0).ok())
        .ok_or_else(|| AppError::Unavailable("Could not determine Logo cache expiry.".to_owned()))?
        .assume_utc();
    let max_age = (next_midnight - now).whole_seconds().max(0);
    let mut response = Response::new(Body::from(image));
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_str(&format!("private, max-age={max_age}, immutable"))
            .map_err(|_| AppError::Unavailable("Logo cache metadata is invalid.".to_owned()))?,
    );
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    Ok(response)
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
    super::assert_same_origin_or_bearer(&state, &headers)?;
    if user.is_some() {
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
        progress: progress_response(challenge_id, outcome.progress),
        global_completion_count: outcome.completion_count,
        player_stats: outcome.player_stats,
    }))
}

pub(super) async fn game_route(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(player_id)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(difficulty): Path<String>,
) -> AppResult<Json<LogoGameResponse>> {
    game(
        State(state),
        headers,
        Path(difficulty),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
}

pub(super) async fn guess_history_route(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(player_id)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
) -> AppResult<Json<LogoGuessHistoryResponse>> {
    guess_history(
        State(state),
        headers,
        Path(challenge_id),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
}

pub(super) async fn image_route(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(player_id)): Extension<AnonymousPlayerId>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    Query(query): Query<LogoImageQuery>,
) -> AppResult<Response> {
    image(
        State(state),
        headers,
        Path(challenge_id),
        Query(LogoPlayerQuery { player_id }),
        Some(query.v),
    )
    .await
}

pub(super) async fn guess_route(
    State(state): State<AppState>,
    Extension(AnonymousPlayerId(player_id)): Extension<AnonymousPlayerId>,
    peer: ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    path: Path<String>,
    payload: Result<Json<LogoGuessRequest>, JsonRejection>,
) -> AppResult<Json<LogoGuessResponse>> {
    let payload = payload.map(|Json(mut payload)| {
        payload.player_id = player_id;
        Json(payload)
    });
    guess(State(state), peer, headers, path, payload).await
}

fn progress_response(
    challenge_id: Uuid,
    progress: repository::logo::LogoProgress,
) -> LogoProgressResponse {
    LogoProgressResponse {
        image_url: format!(
            "/api/v1/games/logo/challenges/{challenge_id}/image?v={}",
            if progress.solved {
                "solved".to_owned()
            } else {
                progress.image_revision.to_string()
            }
        ),
        reveal: progress.reveal,
        image_revision: progress.image_revision,
        maximum_image_revision: progress.maximum_image_revision,
        clues: progress
            .clues
            .into_iter()
            .enumerate()
            .map(|(index, clue)| LogoClueResponse {
                after_incorrect_guesses: clue.after_incorrect_guesses,
                image_url: (clue.kind == "image").then(|| {
                    format!("/api/v1/games/logo/challenges/{challenge_id}/image?v=clue-{index}")
                }),
                kind: clue.kind,
                text: clue.text,
            })
            .collect(),
        solved: progress.solved,
        attribution: progress.attribution,
    }
}

#[cfg(test)]
mod tests;
