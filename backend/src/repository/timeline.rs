use std::collections::BTreeSet;

use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use crate::{
    domain::timeline::{
        TIMELINE_SELECTION_VERSION, TimelineCandidate, TimelineDifficulty, TimelineModelSnapshot,
        select_timeline_puzzle,
    },
    error::{AppError, AppResult},
};

#[derive(Debug, FromRow)]
struct TimelineCandidateRow {
    id: String,
    name: String,
    item_kind: String,
    provider_id: String,
    release_date: String,
    min_pool_rank: i64,
    categories: String,
}

#[derive(Clone, Debug, FromRow)]
struct TimelineChallengeRow {
    id: String,
    challenge_date: String,
    difficulty: String,
    model_order_json: String,
    anchor_positions_json: String,
    tray_order_json: String,
}

#[derive(Debug, FromRow)]
struct TimelineAttemptRow {
    challenge_id: String,
    player_id: String,
    model_order_json: String,
    placements_json: String,
    attempt_number: i64,
    is_correct: i64,
    attempts_remaining_after: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelineChallenge {
    pub id: Uuid,
    pub challenge_date: String,
    pub difficulty: TimelineDifficulty,
    pub model_order: Vec<TimelineModelSnapshot>,
    pub anchor_positions: Vec<usize>,
    pub tray_order: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelineAttemptResult {
    pub placements: Vec<u8>,
    pub attempts_remaining: Option<u16>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelineLatestAttempt {
    pub model_order: Vec<String>,
    pub placements: Vec<u8>,
    pub attempt_number: u16,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelineGameData {
    pub challenge: TimelineChallenge,
    pub attempt_limit: Option<u16>,
    pub attempts_remaining: Option<u16>,
    pub solved: bool,
    pub latest_attempt: Option<TimelineLatestAttempt>,
}

pub struct TimelineAttemptInput {
    pub challenge_id: Uuid,
    pub player_id: Uuid,
    pub user_id: Option<String>,
    pub hardcore_access: bool,
    pub request_id: Uuid,
    pub model_order: Vec<String>,
}

pub async fn timeline_game(
    pool: &SqlitePool,
    date: &str,
    difficulty: TimelineDifficulty,
    secret: &str,
    player_id: Uuid,
) -> AppResult<TimelineGameData> {
    let challenge = ensure_timeline_challenge(pool, date, difficulty, secret).await?;
    let config = difficulty.config();
    let attempt_count = timeline_attempt_count(pool, challenge.id, player_id).await?;
    let latest = sqlx::query_as::<_, TimelineAttemptRow>(
        "SELECT challenge_id, player_id, model_order_json, placements_json, attempt_number, \
         is_correct, attempts_remaining_after FROM timeline_attempts \
         WHERE challenge_id = ? AND player_id = ? ORDER BY attempt_number DESC LIMIT 1",
    )
    .bind(challenge.id.to_string())
    .bind(player_id.to_string())
    .fetch_optional(pool)
    .await?;
    let solved = latest
        .as_ref()
        .is_some_and(|attempt| attempt.is_correct != 0);
    let latest_attempt = latest
        .map(|attempt| -> AppResult<TimelineLatestAttempt> {
            Ok(TimelineLatestAttempt {
                model_order: serde_json::from_str(&attempt.model_order_json)?,
                placements: serde_json::from_str(&attempt.placements_json)?,
                attempt_number: u16::try_from(attempt.attempt_number).map_err(|_| {
                    AppError::Unavailable("Stored Timeline attempt number is invalid.".to_owned())
                })?,
            })
        })
        .transpose()?;

    Ok(TimelineGameData {
        challenge,
        attempt_limit: config.attempt_limit,
        attempts_remaining: config
            .attempt_limit
            .map(|limit| limit.saturating_sub(attempt_count)),
        solved,
        latest_attempt,
    })
}

pub async fn ensure_timeline_challenge(
    pool: &SqlitePool,
    date: &str,
    difficulty: TimelineDifficulty,
    secret: &str,
) -> AppResult<TimelineChallenge> {
    if let Some(challenge) = find_timeline_challenge_by_date(pool, date, difficulty).await? {
        return parse_challenge(challenge);
    }

    let candidates = timeline_candidates(pool).await?;
    let puzzle = select_timeline_puzzle(date, difficulty, secret, &candidates)?;
    sqlx::query(
        "INSERT INTO timeline_challenges \
         (id, challenge_date, difficulty, model_order_json, anchor_positions_json, tray_order_json, \
          selection_version, generated_at, generation_source) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lazy') \
         ON CONFLICT(challenge_date, difficulty) DO NOTHING",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(date)
    .bind(difficulty.as_str())
    .bind(serde_json::to_string(&puzzle.model_order)?)
    .bind(serde_json::to_string(&puzzle.anchor_positions)?)
    .bind(serde_json::to_string(&puzzle.tray_order)?)
    .bind(TIMELINE_SELECTION_VERSION)
    .bind(super::now_unix_millis())
    .execute(pool)
    .await?;

    find_timeline_challenge_by_date(pool, date, difficulty)
        .await?
        .ok_or_else(|| AppError::Unavailable("Today’s Timeline is unavailable.".to_owned()))
        .and_then(parse_challenge)
}

pub async fn process_timeline_attempt(
    pool: &SqlitePool,
    input: TimelineAttemptInput,
) -> AppResult<TimelineAttemptResult> {
    for attempt in 0..12 {
        match process_timeline_attempt_once(pool, &input).await {
            Err(error) if super::is_sqlite_busy(&error) && attempt < 11 => {
                tokio::time::sleep(std::time::Duration::from_millis(10_u64 << attempt)).await;
            }
            result => return result,
        }
    }
    unreachable!("the retry loop always returns")
}

async fn process_timeline_attempt_once(
    pool: &SqlitePool,
    input: &TimelineAttemptInput,
) -> AppResult<TimelineAttemptResult> {
    let mut transaction = pool.begin().await?;
    let connection = &mut *transaction;

    if let Some(stored) = find_attempt_by_request_id(connection, input.request_id).await? {
        let result = replay_attempt(stored, input)?;
        transaction.commit().await?;
        return Ok(result);
    }

    let challenge = find_timeline_challenge(connection, input.challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Timeline challenge not found.".to_owned()))?;
    let challenge = parse_challenge(challenge)?;
    if challenge.difficulty == TimelineDifficulty::Hardcore && !input.hardcore_access {
        return Err(AppError::Forbidden(
            "Hardcore access has not been unlocked for this account.".to_owned(),
        ));
    }
    validate_model_order(&challenge, &input.model_order)?;

    if sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM timeline_attempts \
         WHERE challenge_id = ? AND player_id = ? AND is_correct = 1)",
    )
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .fetch_one(&mut *connection)
    .await?
        != 0
    {
        return Err(AppError::Conflict(
            "TIMELINE_CHALLENGE_COMPLETED".to_owned(),
        ));
    }

    let accepted_attempts = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM timeline_attempts WHERE challenge_id = ? AND player_id = ?",
    )
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .fetch_one(&mut *connection)
    .await?;
    let config = challenge.difficulty.config();
    if config
        .attempt_limit
        .is_some_and(|limit| accepted_attempts >= i64::from(limit))
    {
        return Err(AppError::Conflict(
            "TIMELINE_ATTEMPT_LIMIT_REACHED".to_owned(),
        ));
    }

    let now = super::now_unix_millis();
    super::ensure_anonymous_player(connection, input.player_id, now).await?;
    let placements = input
        .model_order
        .iter()
        .zip(&challenge.model_order)
        .map(|(submitted, expected)| u8::from(submitted == &expected.id))
        .collect::<Vec<_>>();
    let is_correct = placements.iter().all(|placement| *placement == 1);
    let attempt_number = accepted_attempts + 1;
    let attempts_remaining = config
        .attempt_limit
        .map(|limit| limit.saturating_sub(u16::try_from(attempt_number).unwrap_or(u16::MAX)));
    sqlx::query(
        "INSERT INTO timeline_attempts \
         (id, request_id, challenge_id, player_id, user_id, model_order_json, placements_json, \
          attempt_number, is_correct, attempts_remaining_after, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(input.request_id.to_string())
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .bind(&input.user_id)
    .bind(serde_json::to_string(&input.model_order)?)
    .bind(serde_json::to_string(&placements)?)
    .bind(attempt_number)
    .bind(is_correct)
    .bind(attempts_remaining.map(i64::from))
    .bind(now)
    .execute(&mut *connection)
    .await?;

    if is_correct && let Some(user_id) = &input.user_id {
        sqlx::query(
            "INSERT OR IGNORE INTO timeline_user_completions (user_id, challenge_id, completed_at) \
             VALUES (?, ?, ?)",
        )
        .bind(user_id)
        .bind(input.challenge_id.to_string())
        .bind(now)
        .execute(&mut *connection)
        .await?;
        sqlx::query(
            "INSERT OR IGNORE INTO user_game_progress \
             (user_id, game_type, difficulty, category, completed_at) \
             VALUES (?, 'timeline', ?, 'timeline', ?)",
        )
        .bind(user_id)
        .bind(challenge.difficulty.as_str())
        .bind(now)
        .execute(&mut *connection)
        .await?;
    }

    transaction.commit().await?;
    Ok(TimelineAttemptResult {
        placements,
        attempts_remaining,
    })
}

fn validate_model_order(challenge: &TimelineChallenge, submitted: &[String]) -> AppResult<()> {
    let expected = challenge
        .model_order
        .iter()
        .map(|model| model.id.as_str())
        .collect::<BTreeSet<_>>();
    let received = submitted
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    if submitted.len() != challenge.model_order.len()
        || received.len() != submitted.len()
        || received != expected
    {
        return Err(AppError::validation(
            "modelOrder must contain every challenge model exactly once",
        ));
    }
    if challenge.anchor_positions.iter().any(|position| {
        submitted.get(*position) != challenge.model_order.get(*position).map(|model| &model.id)
    }) {
        return Err(AppError::validation(
            "modelOrder must preserve every locked anchor position",
        ));
    }
    Ok(())
}

fn replay_attempt(
    stored: TimelineAttemptRow,
    input: &TimelineAttemptInput,
) -> AppResult<TimelineAttemptResult> {
    let stored_order = serde_json::from_str::<Vec<String>>(&stored.model_order_json)?;
    if stored.challenge_id != input.challenge_id.to_string()
        || stored.player_id != input.player_id.to_string()
        || stored_order != input.model_order
    {
        return Err(AppError::Conflict("REQUEST_ID_REUSED".to_owned()));
    }
    Ok(TimelineAttemptResult {
        placements: serde_json::from_str(&stored.placements_json)?,
        attempts_remaining: stored
            .attempts_remaining_after
            .map(|remaining| {
                u16::try_from(remaining).map_err(|_| {
                    AppError::Unavailable(
                        "Stored Timeline remaining attempt count is invalid.".to_owned(),
                    )
                })
            })
            .transpose()?,
    })
}

async fn timeline_candidates(pool: &SqlitePool) -> AppResult<Vec<TimelineCandidate>> {
    let rows = sqlx::query_as::<_, TimelineCandidateRow>(
        "SELECT item.id, item.name, item.item_kind, item.provider_key AS provider_id, \
         item.release_date, item.min_pool_rank, item.categories_json AS categories \
         FROM timeline_items item LEFT JOIN models m ON m.id = item.model_id \
         LEFT JOIN providers p ON p.id = m.provider_id \
         WHERE item.is_active = 1 AND (item.item_kind = 'event' OR \
           (m.is_guessable = 1 AND m.status = 'active' AND p.is_active = 1)) \
         ORDER BY item.id",
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            Ok(TimelineCandidate {
                id: row.id,
                name: row.name,
                item_kind: row.item_kind,
                provider_id: row.provider_id,
                release_date: row.release_date,
                min_pool_rank: u8::try_from(row.min_pool_rank).map_err(|_| {
                    AppError::Unavailable("Stored Timeline pool rank is invalid.".to_owned())
                })?,
                categories: serde_json::from_str(&row.categories)?,
            })
        })
        .collect()
}

async fn find_timeline_challenge_by_date(
    pool: &SqlitePool,
    date: &str,
    difficulty: TimelineDifficulty,
) -> AppResult<Option<TimelineChallengeRow>> {
    Ok(sqlx::query_as::<_, TimelineChallengeRow>(
        "SELECT id, challenge_date, difficulty, model_order_json, anchor_positions_json, \
         tray_order_json FROM timeline_challenges WHERE challenge_date = ? AND difficulty = ?",
    )
    .bind(date)
    .bind(difficulty.as_str())
    .fetch_optional(pool)
    .await?)
}

async fn find_timeline_challenge(
    connection: &mut SqliteConnection,
    challenge_id: Uuid,
) -> AppResult<Option<TimelineChallengeRow>> {
    Ok(sqlx::query_as::<_, TimelineChallengeRow>(
        "SELECT id, challenge_date, difficulty, model_order_json, anchor_positions_json, \
         tray_order_json FROM timeline_challenges WHERE id = ?",
    )
    .bind(challenge_id.to_string())
    .fetch_optional(connection)
    .await?)
}

async fn find_attempt_by_request_id(
    connection: &mut SqliteConnection,
    request_id: Uuid,
) -> AppResult<Option<TimelineAttemptRow>> {
    Ok(sqlx::query_as::<_, TimelineAttemptRow>(
        "SELECT challenge_id, player_id, model_order_json, placements_json, attempt_number, \
         is_correct, attempts_remaining_after FROM timeline_attempts WHERE request_id = ?",
    )
    .bind(request_id.to_string())
    .fetch_optional(connection)
    .await?)
}

async fn timeline_attempt_count(
    pool: &SqlitePool,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<u16> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM timeline_attempts WHERE challenge_id = ? AND player_id = ?",
    )
    .bind(challenge_id.to_string())
    .bind(player_id.to_string())
    .fetch_one(pool)
    .await?;
    u16::try_from(count)
        .map_err(|_| AppError::Unavailable("Timeline attempt count is invalid.".to_owned()))
}

fn parse_challenge(row: TimelineChallengeRow) -> AppResult<TimelineChallenge> {
    Ok(TimelineChallenge {
        id: Uuid::parse_str(&row.id)
            .map_err(|_| AppError::Unavailable("Stored Timeline ID is invalid.".to_owned()))?,
        challenge_date: row.challenge_date,
        difficulty: TimelineDifficulty::parse(&row.difficulty).ok_or_else(|| {
            AppError::Unavailable("Stored Timeline difficulty is invalid.".to_owned())
        })?,
        model_order: serde_json::from_str(&row.model_order_json)?,
        anchor_positions: serde_json::from_str(&row.anchor_positions_json)?,
        tray_order: serde_json::from_str(&row.tray_order_json)?,
    })
}
