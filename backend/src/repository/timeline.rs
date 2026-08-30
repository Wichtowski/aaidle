use std::collections::{BTreeMap, BTreeSet};

use sqlx::{FromRow, QueryBuilder, Sqlite, SqliteConnection, SqlitePool};
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
    year_annotation: Option<String>,
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
    speedrun_time_ms: Option<i64>,
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
    pub revealed_models: Vec<TimelineModelSnapshot>,
    pub speedrun_time_ms: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelineLeaderboardEntry {
    pub rank: u32,
    pub display_name: String,
    pub is_current_user: bool,
    pub submissions: u16,
    pub time_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TimelineGlobalRunPoint {
    pub challenge_date: String,
    pub submissions: u16,
    pub time_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TimelineGlobalLeaderboardEntry {
    pub rank: u32,
    pub display_name: String,
    pub is_current_user: bool,
    pub completed_speedruns: u32,
    pub average_time_ms: i64,
    pub average_submissions: f64,
    pub fastest_time_ms: i64,
    pub recent_runs: Vec<TimelineGlobalRunPoint>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TimelineGlobalLeaderboard {
    pub fastest: Vec<TimelineGlobalLeaderboardEntry>,
    pub average: Vec<TimelineGlobalLeaderboardEntry>,
    pub completions: Vec<TimelineGlobalLeaderboardEntry>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelineLatestAttempt {
    pub model_order: Vec<String>,
    pub placements: Vec<u8>,
    pub attempt_number: u16,
    pub speedrun_time_ms: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelineGameData {
    pub challenge: TimelineChallenge,
    pub attempt_limit: Option<u16>,
    pub attempts_remaining: Option<u16>,
    pub solved: bool,
    pub speedrun_started_at: Option<i64>,
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
    let speedrun_started_at = if difficulty == TimelineDifficulty::Speedrun {
        sqlx::query_scalar::<_, i64>(
            "SELECT started_at FROM timeline_speedrun_starts WHERE challenge_id = ? AND player_id = ?",
        )
        .bind(challenge.id.to_string())
        .bind(player_id.to_string())
        .fetch_optional(pool)
        .await?
    } else {
        None
    };
    let latest = sqlx::query_as::<_, TimelineAttemptRow>(
        "SELECT challenge_id, player_id, model_order_json, placements_json, attempt_number, \
         is_correct, attempts_remaining_after, speedrun_time_ms FROM timeline_attempts \
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
                speedrun_time_ms: attempt.speedrun_time_ms,
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
        speedrun_started_at,
        latest_attempt,
    })
}

pub async fn start_speedrun(
    pool: &SqlitePool,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<(i64, TimelineChallenge)> {
    let mut transaction = pool.begin().await?;
    let challenge = find_timeline_challenge(&mut transaction, challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Timeline challenge not found.".to_owned()))?;
    if challenge.difficulty != TimelineDifficulty::Speedrun.as_str() {
        return Err(AppError::validation(
            "Speedrun start is only valid for Speedrun challenges.",
        ));
    }
    let now = super::now_unix_millis();
    super::ensure_anonymous_player(&mut transaction, player_id, now).await?;
    sqlx::query(
        "INSERT INTO timeline_speedrun_starts (challenge_id, player_id, started_at) \
         VALUES (?, ?, ?) ON CONFLICT(challenge_id, player_id) DO NOTHING",
    )
    .bind(challenge_id.to_string())
    .bind(player_id.to_string())
    .bind(now)
    .execute(&mut *transaction)
    .await?;
    let started_at = sqlx::query_scalar::<_, i64>(
        "SELECT started_at FROM timeline_speedrun_starts WHERE challenge_id = ? AND player_id = ?",
    )
    .bind(challenge_id.to_string())
    .bind(player_id.to_string())
    .fetch_one(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok((started_at, parse_challenge(challenge)?))
}

pub async fn timeline_leaderboard(
    pool: &SqlitePool,
    challenge_id: Uuid,
    current_user_id: Option<&str>,
) -> AppResult<Vec<TimelineLeaderboardEntry>> {
    let difficulty =
        sqlx::query_scalar::<_, String>("SELECT difficulty FROM timeline_challenges WHERE id = ?")
            .bind(challenge_id.to_string())
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| AppError::NotFound("Timeline challenge not found.".to_owned()))?;
    if difficulty != TimelineDifficulty::Speedrun.as_str() {
        return Err(AppError::validation(
            "Leaderboard is only available for Speedrun challenges.",
        ));
    }
    let rows = sqlx::query_as::<_, (String, String, i64, i64)>(
        "SELECT COALESCE(NULLIF(u.username, ''), 'Anonymous runner'), \
                u.id, a.speedrun_time_ms, a.attempt_number \
         FROM timeline_attempts a \
         JOIN users u ON u.id = a.user_id \
         WHERE a.challenge_id = ? AND a.is_correct = 1 AND a.speedrun_time_ms IS NOT NULL \
           AND u.disabled_at IS NULL \
         ORDER BY a.speedrun_time_ms ASC, a.attempt_number ASC, a.created_at ASC, a.user_id ASC \
         LIMIT 10",
    )
    .bind(challenge_id.to_string())
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .enumerate()
        .map(|(index, (display_name, user_id, time_ms, submissions))| {
            Ok(TimelineLeaderboardEntry {
                rank: index as u32 + 1,
                display_name,
                is_current_user: current_user_id == Some(user_id.as_str()),
                submissions: u16::try_from(submissions).map_err(|_| {
                    AppError::Unavailable("Stored Timeline submission count is invalid.".to_owned())
                })?,
                time_ms,
            })
        })
        .collect::<AppResult<Vec<_>>>()
}

pub async fn timeline_global_leaderboard(
    pool: &SqlitePool,
    current_user_id: Option<&str>,
) -> AppResult<TimelineGlobalLeaderboard> {
    let fastest = timeline_global_ranking(
        pool,
        current_user_id,
        "fastest_time_ms ASC, average_time_ms ASC, completed_speedruns DESC, user_id ASC",
    )
    .await?;
    let average = timeline_global_ranking(
        pool,
        current_user_id,
        "average_time_ms ASC, completed_speedruns DESC, fastest_time_ms ASC, user_id ASC",
    )
    .await?;
    let completions = timeline_global_ranking(
        pool,
        current_user_id,
        "completed_speedruns DESC, average_time_ms ASC, fastest_time_ms ASC, user_id ASC",
    )
    .await?;
    let user_ids = fastest
        .iter()
        .chain(&average)
        .chain(&completions)
        .map(|entry| entry.0.clone())
        .collect::<BTreeSet<_>>();
    let recent_runs = timeline_recent_speedruns(pool, &user_ids).await?;

    Ok(TimelineGlobalLeaderboard {
        fastest: map_global_ranking(fastest, &recent_runs),
        average: map_global_ranking(average, &recent_runs),
        completions: map_global_ranking(completions, &recent_runs),
    })
}

type TimelineGlobalRankingRow = (String, String, i64, i64, f64, i64);

async fn timeline_global_ranking(
    pool: &SqlitePool,
    current_user_id: Option<&str>,
    ordering: &str,
) -> AppResult<Vec<(String, TimelineGlobalLeaderboardEntry)>> {
    let query = format!(
        "SELECT user_id, display_name, completed_speedruns, average_time_ms, \
         average_submissions, fastest_time_ms FROM timeline_speedrun_public_stats \
         ORDER BY {ordering} LIMIT 10"
    );
    let rows = sqlx::query_as::<_, TimelineGlobalRankingRow>(&query)
        .fetch_all(pool)
        .await?;
    rows.into_iter()
        .enumerate()
        .map(
            |(
                index,
                (
                    user_id,
                    display_name,
                    completed_speedruns,
                    average_time_ms,
                    average_submissions,
                    fastest_time_ms,
                ),
            )| {
                Ok((
                    user_id.clone(),
                    TimelineGlobalLeaderboardEntry {
                        rank: index as u32 + 1,
                        display_name,
                        is_current_user: current_user_id == Some(user_id.as_str()),
                        completed_speedruns: u32::try_from(completed_speedruns).map_err(|_| {
                            AppError::Unavailable(
                                "Stored Timeline completion count is invalid.".to_owned(),
                            )
                        })?,
                        average_time_ms,
                        average_submissions,
                        fastest_time_ms,
                        recent_runs: Vec::new(),
                    },
                ))
            },
        )
        .collect()
}

async fn timeline_recent_speedruns(
    pool: &SqlitePool,
    user_ids: &BTreeSet<String>,
) -> AppResult<BTreeMap<String, Vec<TimelineGlobalRunPoint>>> {
    if user_ids.is_empty() {
        return Ok(BTreeMap::new());
    }
    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT user_id, challenge_date, submissions, time_ms FROM (\
         SELECT user_id, challenge_date, submissions, time_ms, \
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY challenge_date DESC) AS run_rank \
         FROM timeline_speedrun_public_runs WHERE user_id IN (",
    );
    let mut separated = query.separated(", ");
    for user_id in user_ids {
        separated.push_bind(user_id);
    }
    separated.push_unseparated(")) WHERE run_rank <= 30 ORDER BY user_id ASC, challenge_date ASC");
    let rows = query
        .build_query_as::<(String, String, i64, i64)>()
        .fetch_all(pool)
        .await?;
    let mut result = BTreeMap::<String, Vec<TimelineGlobalRunPoint>>::new();
    for (user_id, challenge_date, submissions, time_ms) in rows {
        result
            .entry(user_id)
            .or_default()
            .push(TimelineGlobalRunPoint {
                challenge_date,
                submissions: u16::try_from(submissions).map_err(|_| {
                    AppError::Unavailable("Stored Timeline submission count is invalid.".to_owned())
                })?,
                time_ms,
            });
    }
    Ok(result)
}

fn map_global_ranking(
    entries: Vec<(String, TimelineGlobalLeaderboardEntry)>,
    recent_runs: &BTreeMap<String, Vec<TimelineGlobalRunPoint>>,
) -> Vec<TimelineGlobalLeaderboardEntry> {
    entries
        .into_iter()
        .map(|(user_id, mut entry)| {
            entry.recent_runs = recent_runs.get(&user_id).cloned().unwrap_or_default();
            entry
        })
        .collect()
}

pub async fn ensure_timeline_challenge(
    pool: &SqlitePool,
    date: &str,
    difficulty: TimelineDifficulty,
    secret: &str,
) -> AppResult<TimelineChallenge> {
    if let Some(challenge) = find_timeline_challenge_by_date(pool, date, difficulty).await? {
        let parsed = parse_challenge(challenge)?;
        let config = difficulty.config();
        if parsed.model_order.len() == config.total_model_count
            && parsed.anchor_positions.len() == config.locked_anchor_count
        {
            return Ok(parsed);
        }

        sqlx::query("DELETE FROM timeline_challenges WHERE id = ?")
            .bind(parsed.id.to_string())
            .execute(pool)
            .await?;
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

    let challenge = find_timeline_challenge(connection, input.challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Timeline challenge not found.".to_owned()))?;
    let challenge = parse_challenge(challenge)?;
    if let Some(stored) = find_attempt_by_request_id(connection, input.request_id).await? {
        let result = replay_attempt(stored, input, &challenge)?;
        transaction.commit().await?;
        return Ok(result);
    }
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
    let speedrun_started_at = if challenge.difficulty == TimelineDifficulty::Speedrun {
        sqlx::query_scalar::<_, i64>(
            "SELECT started_at FROM timeline_speedrun_starts WHERE challenge_id = ? AND player_id = ?",
        )
        .bind(input.challenge_id.to_string())
        .bind(input.player_id.to_string())
        .fetch_optional(&mut *connection)
        .await?
        .ok_or_else(|| AppError::Conflict("TIMELINE_SPEEDRUN_NOT_STARTED".to_owned()))?
        .into()
    } else {
        None
    };
    let placements = timeline_placements(&challenge, &input.model_order);
    let is_correct = placements.iter().all(|placement| *placement == 1);
    let speedrun_time_ms = (challenge.difficulty == TimelineDifficulty::Speedrun && is_correct)
        .then(|| {
            speedrun_started_at
                .map(|started| now.saturating_sub(started))
                .unwrap_or_default()
        });
    let attempt_number = accepted_attempts + 1;
    let attempts_remaining = config
        .attempt_limit
        .map(|limit| limit.saturating_sub(u16::try_from(attempt_number).unwrap_or(u16::MAX)));
    sqlx::query(
        "INSERT INTO timeline_attempts \
         (id, request_id, challenge_id, player_id, user_id, model_order_json, placements_json, \
          attempt_number, is_correct, attempts_remaining_after, speedrun_started_at, speedrun_time_ms, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    .bind(speedrun_started_at)
    .bind(speedrun_time_ms)
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
        speedrun_time_ms,
        revealed_models: challenge
            .model_order
            .iter()
            .zip(&placements)
            .filter(|(_, placement)| **placement == 1)
            .map(|(model, _)| model.clone())
            .collect(),
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
    challenge: &TimelineChallenge,
) -> AppResult<TimelineAttemptResult> {
    let stored_order = serde_json::from_str::<Vec<String>>(&stored.model_order_json)?;
    if stored.challenge_id != input.challenge_id.to_string()
        || stored.player_id != input.player_id.to_string()
        || stored_order != input.model_order
    {
        return Err(AppError::Conflict("REQUEST_ID_REUSED".to_owned()));
    }
    let placements: Vec<u8> = serde_json::from_str(&stored.placements_json)?;
    Ok(TimelineAttemptResult {
        speedrun_time_ms: stored.speedrun_time_ms,
        revealed_models: challenge
            .model_order
            .iter()
            .zip(&placements)
            .filter(|(_, placement)| **placement == 1)
            .map(|(model, _)| model.clone())
            .collect(),
        placements,
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
         item.release_date, item.year_annotation, item.min_pool_rank, item.categories_json AS categories \
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
                year_annotation: row.year_annotation,
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
         is_correct, attempts_remaining_after, speedrun_time_ms FROM timeline_attempts WHERE request_id = ?",
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

fn release_year(value: &str) -> Option<&str> {
    value
        .get(..4)
        .filter(|year| year.as_bytes().iter().all(u8::is_ascii_digit))
}

fn timeline_placements(challenge: &TimelineChallenge, submitted: &[String]) -> Vec<u8> {
    submitted
        .iter()
        .zip(&challenge.model_order)
        .enumerate()
        .map(|(expected_position, (submitted, expected))| {
            if submitted == &expected.id {
                return 1;
            }

            let same_year = challenge
                .model_order
                .iter()
                .find(|model| model.id == *submitted)
                .and_then(|model| release_year(&model.release_date))
                .zip(release_year(&expected.release_date))
                .is_some_and(|(submitted_year, expected_year)| submitted_year == expected_year);
            let neighbour = challenge.difficulty == TimelineDifficulty::Speedrun
                && challenge
                    .model_order
                    .iter()
                    .position(|model| model.id == *submitted)
                    .is_some_and(|actual| actual.abs_diff(expected_position) == 1);
            if (matches!(challenge.difficulty, TimelineDifficulty::Hardcore) && same_year)
                || neighbour
            {
                2
            } else {
                0
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn placement_challenge(difficulty: TimelineDifficulty) -> TimelineChallenge {
        TimelineChallenge {
            id: Uuid::new_v4(),
            challenge_date: "2026-08-25".to_owned(),
            difficulty,
            model_order: vec![
                TimelineModelSnapshot {
                    id: "first".to_owned(),
                    name: "First".to_owned(),
                    item_kind: "model".to_owned(),
                    release_date: "2020-01-01".to_owned(),
                    year_annotation: None,
                    categories: vec!["language-model".to_owned()],
                },
                TimelineModelSnapshot {
                    id: "second".to_owned(),
                    name: "Second".to_owned(),
                    item_kind: "model".to_owned(),
                    release_date: "2020-06-01".to_owned(),
                    year_annotation: None,
                    categories: vec!["language-model".to_owned()],
                },
                TimelineModelSnapshot {
                    id: "third".to_owned(),
                    name: "Third".to_owned(),
                    item_kind: "model".to_owned(),
                    release_date: "2021-01-01".to_owned(),
                    year_annotation: None,
                    categories: vec!["language-model".to_owned()],
                },
            ],
            anchor_positions: vec![],
            tray_order: vec!["first".to_owned(), "second".to_owned(), "third".to_owned()],
        }
    }

    #[test]
    fn hardcore_marks_same_year_positions_without_marking_normal() {
        let submitted = ["second".to_owned(), "first".to_owned(), "third".to_owned()];
        assert_eq!(
            timeline_placements(
                &placement_challenge(TimelineDifficulty::Hardcore),
                &submitted
            ),
            [2, 2, 1]
        );
        assert_eq!(
            timeline_placements(&placement_challenge(TimelineDifficulty::Normal), &submitted),
            [0, 0, 1]
        );
    }
}
