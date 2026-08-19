use axum::{
    Json,
    extract::{State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde_json::Value;

use crate::{
    dto::ProgressResponse,
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    CLASSIC_CHALLENGE_COMPLETION_CATEGORIES, assert_csrf_or_bearer, assert_same_origin_or_bearer,
    authenticated_user, now_millis, parse_json_payload,
};

pub(super) async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<([(&'static str, &'static str); 1], Json<ProgressResponse>)> {
    let user = authenticated_user(&state, &headers).await?;
    let stored = sqlx::query_scalar::<_, String>(
        "SELECT progress_json FROM user_progress WHERE user_id = ?",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await?;
    let progress = stored
        .map(|value| serde_json::from_str::<Value>(&value))
        .transpose()?
        .map(crate::progress::parse_progress)
        .transpose()?;
    if let Some(progress) = &progress {
        synchronize_progress_records(&state, &user.id, progress).await?;
    }
    Ok((
        [("cache-control", "no-store")],
        Json(ProgressResponse { progress }),
    ))
}

pub(super) async fn put(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<Value>, JsonRejection>,
) -> AppResult<([(&'static str, &'static str); 1], Json<ProgressResponse>)> {
    assert_same_origin_or_bearer(&state, &headers)?;
    assert_csrf_or_bearer(&headers)?;
    let user = authenticated_user(&state, &headers).await?;
    let incoming = crate::progress::parse_progress(parse_json_payload(payload)?)?;
    let progress = persist_merged_progress(&state, &user.id, incoming).await?;
    synchronize_progress_records(&state, &user.id, &progress).await?;
    Ok((
        [("cache-control", "no-store")],
        Json(ProgressResponse {
            progress: Some(progress),
        }),
    ))
}

async fn persist_merged_progress(
    state: &AppState,
    user_id: &str,
    incoming: Value,
) -> AppResult<Value> {
    for _ in 0..12 {
        let stored = sqlx::query_scalar::<_, String>(
            "SELECT progress_json FROM user_progress WHERE user_id = ?",
        )
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?;
        let progress = match &stored {
            Some(value) => {
                crate::progress::merge_progress(serde_json::from_str(value)?, incoming.clone())?
            }
            None => incoming.clone(),
        };
        let serialized = serde_json::to_string(&progress)?;
        let changed = match stored {
            Some(previous) => sqlx::query(
                "UPDATE user_progress SET progress_json = ?, updated_at = ? \
                 WHERE user_id = ? AND progress_json = ?",
            )
            .bind(&serialized)
            .bind(now_millis())
            .bind(user_id)
            .bind(previous)
            .execute(&state.db)
            .await?
            .rows_affected(),
            None => sqlx::query(
                "INSERT INTO user_progress (user_id, progress_json, updated_at) VALUES (?, ?, ?) \
                 ON CONFLICT(user_id) DO NOTHING",
            )
            .bind(user_id)
            .bind(&serialized)
            .bind(now_millis())
            .execute(&state.db)
            .await?
            .rows_affected(),
        };
        if changed == 1 {
            return Ok(progress);
        }
    }
    Err(AppError::Conflict("PROGRESS_UPDATE_CONFLICT".to_owned()))
}

async fn synchronize_progress_records(
    state: &AppState,
    user_id: &str,
    progress: &Value,
) -> AppResult<()> {
    let now = now_millis();
    let player_id = crate::progress::player_id(progress)?;
    for challenge_id in crate::progress::solved_challenge_ids(progress) {
        sqlx::query(
            "INSERT OR IGNORE INTO user_challenge_completions (user_id, challenge_id, completed_at) \
             SELECT ?, d.id, ? FROM daily_challenges d WHERE d.id = ? AND (\
               (d.mode LIKE 'classic:%' AND EXISTS (\
                 SELECT 1 FROM guess_events g WHERE g.challenge_id = d.id \
                 AND g.player_id = ? AND g.is_correct = 1\
                             ))\
             )",
        )
        .bind(user_id)
        .bind(now)
        .bind(&challenge_id)
        .bind(player_id)
        .bind(player_id)
        .execute(&state.db)
        .await?;
        record_classic_challenge_progress(state, user_id, &challenge_id, now).await?;
    }
    Ok(())
}

async fn record_classic_challenge_progress(
    state: &AppState,
    user_id: &str,
    challenge_id: &str,
    now: i64,
) -> AppResult<()> {
    let mode = sqlx::query_scalar::<_, String>("SELECT mode FROM daily_challenges WHERE id = ?")
        .bind(challenge_id)
        .fetch_optional(&state.db)
        .await?;
    let Some(mode) = mode else {
        return Ok(());
    };
    let Some(category) = mode
        .strip_prefix("classic:")
        .and_then(|value| value.strip_suffix(":challenge"))
    else {
        return Ok(());
    };
    if !CLASSIC_CHALLENGE_COMPLETION_CATEGORIES.contains(&category) {
        return Ok(());
    }
    sqlx::query(
        "INSERT OR IGNORE INTO user_game_progress (user_id, game_type, difficulty, category, completed_at) \
         VALUES (?, 'classic', 'challenge', ?, ?)",
    )
    .bind(user_id)
    .bind(category)
    .bind(now)
    .execute(&state.db)
    .await?;
    let completed = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(DISTINCT category) FROM user_game_progress \
         WHERE user_id = ? AND game_type = 'classic' AND difficulty = 'challenge' \
         AND category IN ('llm', 'cv', 'nlp', 'od', 'classical-ml', 'filters')",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;
    if completed == CLASSIC_CHALLENGE_COMPLETION_CATEGORIES.len() as i64 {
        crate::auth::grant_hardcore_access(&state.db, user_id, now).await?;
    }
    Ok(())
}
