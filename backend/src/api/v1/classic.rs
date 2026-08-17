use axum::{
    Json,
    extract::{Path, State, rejection::JsonRejection},
    http::HeaderMap,
};

use crate::{
    dto::{
        ChallengeStatsResponse, ClassicGameResponse, GuessRequest, GuessResponse,
        HardcoreAccessResponse, PlayerStatsResponse, PublicChallenge, TrajectoryRequest,
        TrajectoryResponse,
    },
    error::{AppError, AppResult},
    repository::{self, GuessInput},
    state::AppState,
};

use super::{
    CLASSIC_CHALLENGE_COMPLETION_CATEGORIES, assert_same_origin, authenticated_user,
    current_utc_date, format_next_midnight, is_model_id, now_millis, parse_json_payload,
    parse_uuid, session_cookie,
};

pub(super) async fn guess(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    payload: Result<Json<GuessRequest>, JsonRejection>,
) -> AppResult<Json<GuessResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = payload
        .map_err(|error| match error {
            JsonRejection::BytesRejection(_) => AppError::PayloadTooLarge,
            _ => AppError::validation("Request body must be valid JSON."),
        })?
        .0;
    if !is_model_id(&payload.guessed_model_id) {
        return Err(AppError::validation("guessedModelId is invalid"));
    }
    if !(1..=100).contains(&payload.attempt_number) {
        return Err(AppError::validation(
            "attemptNumber must be between 1 and 100",
        ));
    }
    let result = repository::process_guess(
        &state.db,
        GuessInput {
            challenge_id,
            player_id: payload.player_id,
            request_id: payload.request_id,
            guessed_model_id: payload.guessed_model_id,
            attempt_number: payload.attempt_number,
        },
    )
    .await?;
    let trajectory_access_token = if result.is_correct {
        let (challenge, _) = repository::classic_trajectory(&state.db, challenge_id).await?;
        Some(crate::domain::trajectory::create_access_token(
            &state.config.auth_secret,
            &challenge.id,
            &challenge.answer_model_id,
        )?)
    } else {
        None
    };
    Ok(Json(GuessResponse {
        guessed_model: result.guessed_model,
        comparison: result.comparison,
        is_correct: result.is_correct,
        attempt_number: result.attempt_number,
        player_stats: result.player_stats,
        global_completion_count: result.completion_count,
        trajectory_access_token,
    }))
}

pub(super) async fn trajectory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    payload: Result<Json<TrajectoryRequest>, JsonRejection>,
) -> AppResult<Json<TrajectoryResponse>> {
    assert_same_origin(&state, &headers)?;
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    let (challenge, models) = repository::classic_trajectory(&state.db, challenge_id).await?;
    let session_user =
        crate::auth::user_for_session(&state.db, session_cookie(&headers), now_millis()).await?;
    if session_user.as_ref().is_some_and(|user| user.disabled) {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    let has_completion = match session_user {
        Some(user) => sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM user_challenge_completions WHERE user_id = ? AND challenge_id = ?)",
        )
        .bind(user.id)
        .bind(&challenge.id)
        .fetch_one(&state.db)
        .await?
            != 0,
        None => false,
    };
    if !has_completion
        && !crate::domain::trajectory::has_access(
            &state.config.auth_secret,
            payload.trajectory_access_token.as_deref(),
            &challenge.id,
            &challenge.answer_model_id,
        )?
    {
        return Err(AppError::Forbidden(
            "Solve this challenge to view its model-space trajectory.".to_owned(),
        ));
    }
    Ok(Json(TrajectoryResponse { models }))
}

pub(super) async fn game(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((category, difficulty)): Path<(String, String)>,
) -> AppResult<Json<ClassicGameResponse>> {
    let category = repository::ClassicCategory::parse(&category)
        .ok_or_else(|| AppError::validation("Unknown Classic category."))?;
    let difficulty = repository::ClassicDifficulty::parse(&difficulty)
        .ok_or_else(|| AppError::validation("Unknown Classic difficulty."))?;
    classic_game_response(&state, &headers, category, difficulty).await
}

pub(super) async fn hardcore_game(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<ClassicGameResponse>> {
    classic_game_response(
        &state,
        &headers,
        repository::ClassicCategory::Hardcore,
        repository::ClassicDifficulty::Hardcore,
    )
    .await
}

pub(super) async fn hardcore_access(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(
    [(&'static str, &'static str); 1],
    Json<HardcoreAccessResponse>,
)> {
    assert_same_origin(&state, &headers)?;
    let user = authenticated_user(&state, &headers).await?;
    if !crate::auth::has_hardcore_access(&state.db, &user.id).await? {
        let completed = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT category) FROM user_game_progress \
             WHERE user_id = ? AND game_type = 'classic' AND difficulty = 'challenge' \
             AND category IN ('llm', 'cv', 'nlp', 'od', 'classical-ml', 'filters')",
        )
        .bind(&user.id)
        .fetch_one(&state.db)
        .await?;
        if completed != CLASSIC_CHALLENGE_COMPLETION_CATEGORIES.len() as i64 {
            return Err(AppError::Forbidden(
                "Complete every Classic Challenge category to enter Hardcore.".to_owned(),
            ));
        }
        crate::auth::grant_hardcore_access(&state.db, &user.id, now_millis()).await?;
    }
    Ok((
        [("cache-control", "no-store")],
        Json(HardcoreAccessResponse { unlocked: true }),
    ))
}

async fn classic_game_response(
    state: &AppState,
    headers: &HeaderMap,
    category: repository::ClassicCategory,
    difficulty: repository::ClassicDifficulty,
) -> AppResult<Json<ClassicGameResponse>> {
    if category == repository::ClassicCategory::Hardcore {
        let user = authenticated_user(state, headers).await?;
        if user.disabled || !crate::auth::has_hardcore_access(&state.db, &user.id).await? {
            return Err(AppError::Forbidden(
                "Hardcore access has not been unlocked for this account.".to_owned(),
            ));
        }
    }
    let game = repository::classic_game(
        &state.db,
        &current_utc_date()?,
        category,
        difficulty,
        &state.config.daily_selection_secret,
        crate::config::DAILY_ANSWER_COOLDOWN_DAYS,
    )
    .await?;
    Ok(Json(ClassicGameResponse {
        challenge: PublicChallenge {
            id: parse_uuid(&game.challenge.id, "Stored challenge ID is invalid.")?,
            date: game.challenge.challenge_date,
            mode: game.challenge.mode,
            expires_at: format_next_midnight()?,
        },
        models: game.models,
        columns: game.columns,
        global_completion_count: game.completion_count,
    }))
}

pub(super) async fn challenge_stats(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
) -> AppResult<Json<ChallengeStatsResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let stats = repository::challenge_stats(&state.db, challenge_id).await?;
    Ok(Json(ChallengeStatsResponse {
        challenge_id,
        total_guesses: stats.total_guesses,
        unique_players: stats.unique_players,
        correct_guesses: stats.correct_guesses,
    }))
}

pub(super) async fn player_stats(
    State(state): State<AppState>,
    Path(player_id): Path<String>,
) -> AppResult<Json<PlayerStatsResponse>> {
    let player_id = parse_uuid(&player_id, "playerId must be a UUID")?;
    Ok(Json(PlayerStatsResponse {
        player_id,
        stats: repository::player_stats(&state.db, player_id).await?,
    }))
}
