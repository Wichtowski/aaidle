use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, SqlitePool};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use uuid::Uuid;

use crate::domain::difficulty::Difficulty;
use crate::domain::timeline::TIMELINE_HARDCORE_ATTEMPT_LIMIT;
use crate::error::{AppError, AppResult};

const MAX_ACTIVE_GAMES: usize = 16;
const MAX_PROGRESS_RESPONSE_BYTES: usize = 256 * 1024;
pub const HISTORY_PAGE_SIZE: i64 = 3;
const CHALLENGE_CATEGORIES: [&str; 6] = ["llm", "cv", "nlp", "od", "classical-ml", "filters"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProgressSyncRequest {
    pub version: u8,
    pub player_id: Uuid,
    pub preferences: ProgressPreferencesInput,
    #[serde(default)]
    pub active_games: Vec<ActiveGameInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProgressPreferencesInput {
    #[serde(default)]
    pub reduced_motion: bool,
    #[serde(default)]
    pub high_contrast: bool,
    #[serde(default)]
    pub has_seen_classic_privacy: bool,
    pub has_seen_classic_how_to_play: bool,
    pub inner_circle_active: bool,
    pub hell_mode: bool,
    pub has_autoplayed_hardcore_soundtrack: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProgressPreferencesUpdate {
    pub has_seen_classic_how_to_play: bool,
    pub inner_circle_active: bool,
    pub hell_mode: bool,
    pub has_autoplayed_hardcore_soundtrack: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActiveGameInput {
    pub challenge_id: Uuid,
    pub started_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressHistoryResponse {
    pub games: Vec<ProgressHistoryGame>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub stats: ProgressHistoryStats,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressHistoryGame {
    pub challenge_id: String,
    pub challenge_date: String,
    pub mode: String,
    pub status: &'static str,
    pub guess_count: i64,
    pub guessed_model_names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressHistoryStats {
    pub current_streak: i64,
    pub best_streak: i64,
    pub games_played: i64,
    pub games_won: i64,
    pub guess_distribution: BTreeMap<String, i64>,
}

#[derive(FromRow)]
struct ProfileRow {
    primary_player_id: String,
    has_seen_classic_how_to_play: i64,
    inner_circle_active: i64,
    hell_mode: i64,
    has_autoplayed_hardcore_soundtrack: i64,
}

#[derive(FromRow)]
struct ProgressGameRow {
    challenge_id: String,
    challenge_date: String,
    mode: String,
    started_at: i64,
    completed_at: Option<i64>,
}

#[derive(FromRow)]
struct HistoryRow {
    challenge_id: String,
    challenge_date: String,
    mode: String,
    guess_count: i64,
    solved: i64,
}

#[derive(FromRow)]
struct PlayerStatsSummaryRow {
    current_streak: i64,
    best_streak: i64,
    games_won: i64,
}

struct PlayerStatsSummary {
    current_streak: i64,
    best_streak: i64,
    games_played: i64,
}

pub async fn synchronize(
    pool: &SqlitePool,
    user_id: &str,
    incoming: &ProgressSyncRequest,
    now: i64,
) -> AppResult<()> {
    if incoming.version != 1 {
        return Err(AppError::validation("Progress version must be 1."));
    }
    if incoming.active_games.len() > MAX_ACTIVE_GAMES {
        return Err(AppError::validation("Progress has too many active games."));
    }
    let active_games = incoming
        .active_games
        .iter()
        .map(|game| {
            let started_at = OffsetDateTime::parse(&game.started_at, &Rfc3339)
                .map_err(|_| AppError::validation("Progress game startedAt is invalid."))?;
            Ok((game.challenge_id.to_string(), unix_millis(started_at)?))
        })
        .collect::<AppResult<Vec<_>>>()?;

    let player_id = incoming.player_id.to_string();
    let mut transaction = pool.begin().await?;
    let has_hardcore_access = sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM user_hardcore_access WHERE user_id = ?) \
         OR EXISTS(SELECT 1 FROM user_unlocks WHERE user_id = ? AND unlock_key = 'hardcore-mode')",
    )
    .bind(user_id)
    .bind(user_id)
    .fetch_one(&mut *transaction)
    .await?
        != 0;
    sqlx::query(
        "INSERT INTO anonymous_players (id, created_at, last_seen_at) VALUES (?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at",
    )
    .bind(&player_id)
    .bind(now)
    .bind(now)
    .execute(&mut *transaction)
    .await?;
    let linked_user = sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM user_player_links WHERE player_id = ?",
    )
    .bind(&player_id)
    .fetch_optional(&mut *transaction)
    .await?;
    if linked_user
        .as_deref()
        .is_some_and(|linked| linked != user_id)
    {
        return Err(AppError::Conflict("PLAYER_ALREADY_LINKED".to_owned()));
    }
    let new_player_link = sqlx::query(
        "INSERT OR IGNORE INTO user_player_links (user_id, player_id, linked_at) VALUES (?, ?, ?)",
    )
    .bind(user_id)
    .bind(&player_id)
    .bind(now)
    .execute(&mut *transaction)
    .await?
    .rows_affected()
        == 1;
    sqlx::query(
        "INSERT INTO user_progress_profiles \
         (user_id, primary_player_id, has_seen_classic_how_to_play, inner_circle_active, hell_mode, \
          has_autoplayed_hardcore_soundtrack, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(user_id) DO UPDATE SET \
          has_seen_classic_how_to_play = MAX(has_seen_classic_how_to_play, excluded.has_seen_classic_how_to_play), \
          has_autoplayed_hardcore_soundtrack = MAX(has_autoplayed_hardcore_soundtrack, excluded.has_autoplayed_hardcore_soundtrack), \
          updated_at = excluded.updated_at",
    )
    .bind(user_id)
    .bind(&player_id)
    .bind(incoming.preferences.has_seen_classic_how_to_play)
    .bind(has_hardcore_access && incoming.preferences.inner_circle_active)
    .bind(has_hardcore_access && incoming.preferences.hell_mode)
    .bind(incoming.preferences.has_autoplayed_hardcore_soundtrack)
    .bind(now)
    .execute(&mut *transaction)
    .await?;
    let primary_player_id = sqlx::query_scalar::<_, String>(
        "SELECT primary_player_id FROM user_progress_profiles WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_one(&mut *transaction)
    .await?;

    sqlx::query("UPDATE guess_events SET user_id = ? WHERE player_id = ? AND user_id IS NULL")
        .bind(user_id)
        .bind(&player_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query(
        "UPDATE visual_clue_guess_events SET user_id = ? WHERE player_id = ? AND user_id IS NULL",
    )
    .bind(user_id)
    .bind(&player_id)
    .execute(&mut *transaction)
    .await?;
    sqlx::query("UPDATE timeline_attempts SET user_id = ? WHERE player_id = ? AND user_id IS NULL")
        .bind(user_id)
        .bind(&player_id)
        .execute(&mut *transaction)
        .await?;
    let merged_player = player_id != primary_player_id;
    if merged_player {
        sqlx::query(
            "DELETE FROM guess_events WHERE player_id = ? AND EXISTS (\
               SELECT 1 FROM guess_events canonical WHERE canonical.player_id = ? \
               AND canonical.challenge_id = guess_events.challenge_id \
               AND canonical.guessed_model_id = guess_events.guessed_model_id\
             )",
        )
        .bind(&player_id)
        .bind(&primary_player_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("UPDATE guess_events SET player_id = ? WHERE player_id = ?")
            .bind(&primary_player_id)
            .bind(&player_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(
            "DELETE FROM visual_clue_guess_events WHERE player_id = ? AND EXISTS (\
               SELECT 1 FROM visual_clue_guess_events canonical WHERE canonical.player_id = ? \
               AND canonical.challenge_id = visual_clue_guess_events.challenge_id \
               AND canonical.guessed_entity_id = visual_clue_guess_events.guessed_entity_id\
             )",
        )
        .bind(&player_id)
        .bind(&primary_player_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("UPDATE visual_clue_guess_events SET player_id = ? WHERE player_id = ?")
            .bind(&primary_player_id)
            .bind(&player_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(
            "UPDATE timeline_attempts SET attempt_number = attempt_number + 1000000 \
             WHERE player_id = ?",
        )
        .bind(&player_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("UPDATE timeline_attempts SET player_id = ? WHERE player_id = ?")
            .bind(&primary_player_id)
            .bind(&player_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(
            "UPDATE timeline_attempts SET attempt_number = attempt_number + 2000000 \
             WHERE player_id = ?",
        )
        .bind(&primary_player_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE timeline_attempts AS current SET attempt_number = (\
               SELECT COUNT(*) FROM timeline_attempts AS previous \
               WHERE previous.player_id = current.player_id \
               AND previous.challenge_id = current.challenge_id \
               AND (previous.created_at < current.created_at \
                 OR (previous.created_at = current.created_at AND previous.id <= current.id))\
             ) WHERE player_id = ?",
        )
        .bind(&primary_player_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE timeline_attempts SET attempts_remaining_after = CASE \
               WHEN (SELECT difficulty FROM timeline_challenges WHERE id = challenge_id) = 'hardcore' \
               THEN MAX(0, ? - attempt_number) ELSE NULL END \
             WHERE player_id = ?",
        )
        .bind(i64::from(TIMELINE_HARDCORE_ATTEMPT_LIMIT))
        .bind(&primary_player_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM player_mode_stats WHERE player_id IN (?, ?)")
            .bind(&primary_player_id)
            .bind(&player_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(
            "UPDATE challenge_guess_stats SET \
             total_guess_count = (SELECT COUNT(*) FROM guess_events g WHERE g.challenge_id = challenge_guess_stats.challenge_id AND g.guessed_model_id = challenge_guess_stats.guessed_model_id), \
             unique_player_count = (SELECT COUNT(DISTINCT player_id) FROM guess_events g WHERE g.challenge_id = challenge_guess_stats.challenge_id AND g.guessed_model_id = challenge_guess_stats.guessed_model_id), \
             correct_guess_count = (SELECT COALESCE(SUM(is_correct), 0) FROM guess_events g WHERE g.challenge_id = challenge_guess_stats.challenge_id AND g.guessed_model_id = challenge_guess_stats.guessed_model_id), \
             updated_at = ? WHERE challenge_id IN (SELECT challenge_id FROM guess_events WHERE user_id = ?)",
        )
        .bind(now)
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE challenge_completion_counts SET completion_count = (\
               SELECT COUNT(DISTINCT player_id) FROM guess_events g \
               WHERE g.challenge_id = challenge_completion_counts.challenge_id AND g.is_correct = 1\
             ) WHERE challenge_id IN (SELECT challenge_id FROM guess_events WHERE user_id = ?)",
        )
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE visual_clue_completion_counts SET completion_count = (\
               SELECT COUNT(DISTINCT player_id) FROM visual_clue_guess_events g \
               WHERE g.challenge_id = visual_clue_completion_counts.challenge_id AND g.is_correct = 1\
             ) WHERE challenge_id IN (SELECT challenge_id FROM visual_clue_guess_events WHERE user_id = ?)",
        )
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
    }

    for (challenge_id, started_at) in active_games {
        let is_classic = sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM daily_challenges WHERE id = ? AND mode LIKE 'classic:%')",
        )
        .bind(&challenge_id)
        .fetch_one(&mut *transaction)
        .await?
            != 0;
        if !is_classic {
            return Err(AppError::validation("Progress challengeId is invalid."));
        }
        sqlx::query(
            "INSERT INTO user_game_states (user_id, challenge_id, started_at, updated_at) \
             VALUES (?, ?, ?, ?) ON CONFLICT(user_id, challenge_id) DO UPDATE SET \
             started_at = MIN(user_game_states.started_at, excluded.started_at), updated_at = excluded.updated_at",
        )
        .bind(user_id)
        .bind(challenge_id)
        .bind(started_at)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
    }
    sqlx::query(
        "DELETE FROM user_game_states WHERE user_id = ? AND (challenge_id IN (\
           SELECT challenge_id FROM guess_events WHERE user_id = ? AND is_correct = 1\
         ) OR challenge_id NOT IN (\
           SELECT challenge_id FROM user_game_states WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?\
         ))",
    )
    .bind(user_id)
    .bind(user_id)
    .bind(user_id)
    .bind(MAX_ACTIVE_GAMES as i64)
    .execute(&mut *transaction)
    .await?;
    if new_player_link {
        synchronize_completion_records(&mut transaction, user_id, now).await?;
    }
    transaction.commit().await?;

    if merged_player {
        rebuild_primary_player_stats(pool, &primary_player_id, now).await?;
    }

    if completed_challenge_categories(pool, user_id).await? == CHALLENGE_CATEGORIES.len() as i64 {
        crate::auth::grant_hardcore_access(pool, user_id, now).await?;
    }
    Ok(())
}

pub async fn update_preferences(
    pool: &SqlitePool,
    user_id: &str,
    incoming: &ProgressPreferencesUpdate,
    now: i64,
) -> AppResult<()> {
    let has_hardcore_access = crate::auth::has_hardcore_access(pool, user_id).await?;
    let result = sqlx::query(
        "UPDATE user_progress_profiles SET has_seen_classic_how_to_play = ?, \
         inner_circle_active = ?, hell_mode = ?, has_autoplayed_hardcore_soundtrack = ?, \
         updated_at = ? WHERE user_id = ?",
    )
    .bind(incoming.has_seen_classic_how_to_play)
    .bind(has_hardcore_access && incoming.inner_circle_active)
    .bind(has_hardcore_access && incoming.hell_mode)
    .bind(incoming.has_autoplayed_hardcore_soundtrack)
    .bind(now)
    .bind(user_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Progress profile not found.".to_owned()));
    }
    Ok(())
}

async fn rebuild_primary_player_stats(
    pool: &SqlitePool,
    player_id: &str,
    now: i64,
) -> AppResult<()> {
    let player_id = Uuid::parse_str(player_id)
        .map_err(|_| AppError::Unavailable("Stored player ID is invalid.".to_owned()))?;
    let modes = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT d.mode FROM guess_events g JOIN daily_challenges d ON d.id = g.challenge_id \
         WHERE g.player_id = ?",
    )
    .bind(player_id.to_string())
    .fetch_all(pool)
    .await?;
    for mode in modes {
        crate::repository::rebuild_classic_player_stats(pool, player_id, &mode, now).await?;
    }
    let visual_modes = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT d.mode FROM visual_clue_guess_events g \
         JOIN visual_clue_challenges d ON d.id = g.challenge_id WHERE g.player_id = ?",
    )
    .bind(player_id.to_string())
    .fetch_all(pool)
    .await?;
    for mode in visual_modes {
        crate::repository::rebuild_visual_player_stats(pool, player_id, &mode, now).await?;
    }
    Ok(())
}

pub async fn load(pool: &SqlitePool, user_id: &str) -> AppResult<Option<Value>> {
    let profile = sqlx::query_as::<_, ProfileRow>(
        "SELECT primary_player_id, has_seen_classic_how_to_play, inner_circle_active, hell_mode, \
         has_autoplayed_hardcore_soundtrack FROM user_progress_profiles WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    let Some(profile) = profile else {
        return Ok(None);
    };
    let rows = sqlx::query_as::<_, ProgressGameRow>(
        "WITH recent_games AS (\
           SELECT d.id AS challenge_id, d.challenge_date, d.mode, MIN(g.created_at) AS started_at, \
                  MIN(CASE WHEN g.is_correct = 1 THEN g.created_at END) AS completed_at \
           FROM guess_events g JOIN daily_challenges d ON d.id = g.challenge_id \
           WHERE g.user_id = ? AND (d.challenge_date >= date('now', '-7 days') OR d.id = (\
             SELECT g2.challenge_id FROM guess_events g2 JOIN daily_challenges d2 ON d2.id = g2.challenge_id \
             WHERE g2.user_id = ? AND g2.is_correct = 1 AND d2.mode = 'classic:hardcore:hardcore' \
             ORDER BY d2.challenge_date DESC LIMIT 1\
           )) \
           GROUP BY d.id, d.challenge_date, d.mode \
           UNION ALL \
           SELECT d.id, d.challenge_date, d.mode, s.started_at, NULL \
           FROM user_game_states s JOIN daily_challenges d ON d.id = s.challenge_id \
           WHERE s.user_id = ? AND NOT EXISTS (\
             SELECT 1 FROM guess_events g WHERE g.user_id = s.user_id AND g.challenge_id = s.challenge_id\
           )\
         ) SELECT challenge_id, challenge_date, mode, started_at, completed_at \
         FROM recent_games ORDER BY challenge_date DESC, mode LIMIT 64",
    )
    .bind(user_id)
    .bind(user_id)
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    let games = rows
        .into_iter()
        .map(|row| {
            let completed_at = row.completed_at.map(format_millis).transpose()?;
            Ok(json!({
                "challengeId": row.challenge_id,
                "challengeDate": row.challenge_date,
                "mode": row.mode,
                "startedAt": format_millis(row.started_at)?,
                "completedAt": completed_at,
            }))
        })
        .collect::<AppResult<Vec<Value>>>()?;
    let stats = player_stats_summary(pool, &profile.primary_player_id).await?;
    let progress = json!({
        "version": 1,
        "playerId": profile.primary_player_id,
        "games": games,
        "stats": {
            "currentStreak": stats.current_streak,
            "bestStreak": stats.best_streak,
            "gamesPlayed": stats.games_played,
        },
        "preferences": {
            "hasSeenClassicHowToPlay": profile.has_seen_classic_how_to_play != 0,
            "innerCircleActive": profile.inner_circle_active != 0,
            "hellMode": profile.hell_mode != 0,
            "hasAutoplayedHardcoreSoundtrack": profile.has_autoplayed_hardcore_soundtrack != 0,
        }
    });
    if serde_json::to_vec(&progress)?.len() > MAX_PROGRESS_RESPONSE_BYTES {
        return Err(AppError::Unavailable(
            "Stored progress exceeds the safe response limit.".to_owned(),
        ));
    }
    Ok(Some(progress))
}

pub async fn history(
    pool: &SqlitePool,
    user_id: &str,
    game: &str,
    category: &str,
    page: i64,
) -> AppResult<ProgressHistoryResponse> {
    if !(1..=1_000_000).contains(&page) {
        return Err(AppError::validation("page must be between 1 and 1000000"));
    }
    match game {
        "classic" => classic_history(pool, user_id, category, page).await,
        "emoji" => emoji_history(pool, user_id, category, page).await,
        "timeline" => timeline_history(pool, user_id, category, page).await,
        _ => Err(AppError::validation("Unknown progress game.")),
    }
}

async fn classic_history(
    pool: &SqlitePool,
    user_id: &str,
    category: &str,
    page: i64,
) -> AppResult<ProgressHistoryResponse> {
    if !matches!(
        category,
        "llm" | "cv" | "nlp" | "object-detection" | "classical-ml" | "filters" | "hardcore"
    ) {
        return Err(AppError::validation("Unknown Classic category."));
    }
    let mode_segment = if category == "object-detection" {
        "od"
    } else {
        category
    };
    let pattern = format!("classic:{mode_segment}:%");
    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM (SELECT g.challenge_id FROM guess_events g \
         JOIN daily_challenges d ON d.id = g.challenge_id \
         WHERE g.user_id = ? AND d.mode LIKE ? GROUP BY g.challenge_id)",
    )
    .bind(user_id)
    .bind(&pattern)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, HistoryRow>(
        "SELECT d.id AS challenge_id, d.challenge_date, d.mode, COUNT(*) AS guess_count, \
         MAX(g.is_correct) AS solved FROM guess_events g \
         JOIN daily_challenges d ON d.id = g.challenge_id \
         WHERE g.user_id = ? AND d.mode LIKE ? GROUP BY d.id, d.challenge_date, d.mode \
         ORDER BY d.challenge_date DESC, d.mode LIMIT ? OFFSET ?",
    )
    .bind(user_id)
    .bind(&pattern)
    .bind(HISTORY_PAGE_SIZE)
    .bind((page - 1) * HISTORY_PAGE_SIZE)
    .fetch_all(pool)
    .await?;
    let mut games = Vec::with_capacity(rows.len());
    for row in rows {
        let guessed_model_names = sqlx::query_scalar::<_, String>(
            "SELECT m.name FROM guess_events g JOIN models m ON m.id = g.guessed_model_id \
             WHERE g.user_id = ? AND g.challenge_id = ? ORDER BY g.attempt_number, g.created_at LIMIT 100",
        )
        .bind(user_id)
        .bind(&row.challenge_id)
        .fetch_all(pool)
        .await?;
        games.push(ProgressHistoryGame {
            challenge_id: row.challenge_id,
            challenge_date: row.challenge_date,
            mode: row.mode,
            status: if row.solved != 0 {
                "solved"
            } else {
                "in-progress"
            },
            guess_count: row.guess_count,
            guessed_model_names,
        });
    }
    Ok(ProgressHistoryResponse {
        games,
        total,
        page,
        page_size: HISTORY_PAGE_SIZE,
        stats: history_stats(pool, user_id, &pattern).await?,
    })
}

async fn emoji_history(
    pool: &SqlitePool,
    user_id: &str,
    difficulty: &str,
    page: i64,
) -> AppResult<ProgressHistoryResponse> {
    if Difficulty::parse(difficulty).is_none() {
        return Err(AppError::validation("Unknown Emoji difficulty."));
    }
    let mode = format!("emoji-z:{difficulty}");
    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM (SELECT a.challenge_id FROM visual_clue_guess_events a \
         JOIN visual_clue_challenges c ON c.id = a.challenge_id \
         WHERE a.user_id = ? AND c.mode = ? GROUP BY a.challenge_id)",
    )
    .bind(user_id)
    .bind(&mode)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, HistoryRow>(
        "SELECT c.id AS challenge_id, c.challenge_date, c.mode, COUNT(*) AS guess_count, \
         MAX(a.is_correct) AS solved FROM visual_clue_guess_events a \
         JOIN visual_clue_challenges c ON c.id = a.challenge_id \
         WHERE a.user_id = ? AND c.mode = ? GROUP BY c.id, c.challenge_date, c.mode \
         ORDER BY c.challenge_date DESC LIMIT ? OFFSET ?",
    )
    .bind(user_id)
    .bind(&mode)
    .bind(HISTORY_PAGE_SIZE)
    .bind((page - 1) * HISTORY_PAGE_SIZE)
    .fetch_all(pool)
    .await?;
    let all_rows = emoji_history_rows(pool, user_id, &mode).await?;
    let mut games = Vec::with_capacity(rows.len());
    for row in rows {
        let guessed_model_names = sqlx::query_scalar::<_, String>(
            "SELECT entity.name FROM visual_clue_guess_events attempt \
             JOIN visual_clue_entities entity ON entity.id = attempt.guessed_entity_id \
             WHERE attempt.user_id = ? AND attempt.challenge_id = ? \
             ORDER BY attempt.attempt_number, attempt.created_at LIMIT 100",
        )
        .bind(user_id)
        .bind(&row.challenge_id)
        .fetch_all(pool)
        .await?;
        games.push(history_game(row, guessed_model_names));
    }
    Ok(ProgressHistoryResponse {
        games,
        total,
        page,
        page_size: HISTORY_PAGE_SIZE,
        stats: history_stats_from_rows(&all_rows, false)?,
    })
}

async fn timeline_history(
    pool: &SqlitePool,
    user_id: &str,
    difficulty: &str,
    page: i64,
) -> AppResult<ProgressHistoryResponse> {
    if Difficulty::parse(difficulty).is_none() {
        return Err(AppError::validation("Unknown Timeline difficulty."));
    }
    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM (SELECT attempt.challenge_id FROM timeline_attempts attempt \
         JOIN timeline_challenges challenge ON challenge.id = attempt.challenge_id \
         WHERE attempt.user_id = ? AND challenge.difficulty = ? GROUP BY attempt.challenge_id)",
    )
    .bind(user_id)
    .bind(difficulty)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, HistoryRow>(
        "SELECT challenge.id AS challenge_id, challenge.challenge_date, \
         'timeline:' || challenge.difficulty AS mode, COUNT(*) AS guess_count, \
         MAX(attempt.is_correct) AS solved FROM timeline_attempts attempt \
         JOIN timeline_challenges challenge ON challenge.id = attempt.challenge_id \
         WHERE attempt.user_id = ? AND challenge.difficulty = ? \
         GROUP BY challenge.id, challenge.challenge_date, challenge.difficulty \
         ORDER BY challenge.challenge_date DESC LIMIT ? OFFSET ?",
    )
    .bind(user_id)
    .bind(difficulty)
    .bind(HISTORY_PAGE_SIZE)
    .bind((page - 1) * HISTORY_PAGE_SIZE)
    .fetch_all(pool)
    .await?;
    let all_rows = timeline_history_rows(pool, user_id, difficulty).await?;
    let games = rows
        .into_iter()
        .map(|row| {
            let labels = (1..=row.guess_count)
                .map(|attempt| format!("Submission {attempt}"))
                .collect();
            history_game(row, labels)
        })
        .collect();
    Ok(ProgressHistoryResponse {
        games,
        total,
        page,
        page_size: HISTORY_PAGE_SIZE,
        stats: history_stats_from_rows(&all_rows, true)?,
    })
}

fn history_game(row: HistoryRow, guessed_model_names: Vec<String>) -> ProgressHistoryGame {
    ProgressHistoryGame {
        challenge_id: row.challenge_id,
        challenge_date: row.challenge_date,
        mode: row.mode,
        status: if row.solved != 0 {
            "solved"
        } else {
            "in-progress"
        },
        guess_count: row.guess_count,
        guessed_model_names,
    }
}

async fn emoji_history_rows(
    pool: &SqlitePool,
    user_id: &str,
    mode: &str,
) -> AppResult<Vec<HistoryRow>> {
    Ok(sqlx::query_as::<_, HistoryRow>(
        "SELECT c.id AS challenge_id, c.challenge_date, c.mode, COUNT(*) AS guess_count, \
         MAX(a.is_correct) AS solved FROM visual_clue_guess_events a \
         JOIN visual_clue_challenges c ON c.id = a.challenge_id \
         WHERE a.user_id = ? AND c.mode = ? GROUP BY c.id, c.challenge_date, c.mode \
         ORDER BY c.challenge_date DESC",
    )
    .bind(user_id)
    .bind(mode)
    .fetch_all(pool)
    .await?)
}

async fn timeline_history_rows(
    pool: &SqlitePool,
    user_id: &str,
    difficulty: &str,
) -> AppResult<Vec<HistoryRow>> {
    Ok(sqlx::query_as::<_, HistoryRow>(
        "SELECT challenge.id AS challenge_id, challenge.challenge_date, \
         'timeline:' || challenge.difficulty AS mode, COUNT(*) AS guess_count, \
         MAX(attempt.is_correct) AS solved FROM timeline_attempts attempt \
         JOIN timeline_challenges challenge ON challenge.id = attempt.challenge_id \
         WHERE attempt.user_id = ? AND challenge.difficulty = ? \
         GROUP BY challenge.id, challenge.challenge_date, challenge.difficulty \
         ORDER BY challenge.challenge_date DESC",
    )
    .bind(user_id)
    .bind(difficulty)
    .fetch_all(pool)
    .await?)
}

pub async fn canonical_player_id(
    pool: &SqlitePool,
    user_id: &str,
    requested_player_id: Uuid,
    now: i64,
) -> AppResult<Uuid> {
    let fallback = ProgressSyncRequest {
        version: 1,
        player_id: requested_player_id,
        preferences: ProgressPreferencesInput {
            reduced_motion: false,
            high_contrast: false,
            has_seen_classic_privacy: false,
            has_seen_classic_how_to_play: false,
            inner_circle_active: false,
            hell_mode: false,
            has_autoplayed_hardcore_soundtrack: false,
        },
        active_games: Vec::new(),
    };
    if sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM user_progress_profiles WHERE user_id = ?)",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?
        == 0
    {
        synchronize(pool, user_id, &fallback, now).await?;
    }
    let player_id = sqlx::query_scalar::<_, String>(
        "SELECT primary_player_id FROM user_progress_profiles WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Uuid::parse_str(&player_id)
        .map_err(|_| AppError::Unavailable("Stored player ID is invalid.".to_owned()))
}

pub async fn record_authenticated_classic_completion(
    pool: &SqlitePool,
    user_id: &str,
    challenge_id: Uuid,
    now: i64,
) -> AppResult<()> {
    let mut transaction = pool.begin().await?;
    sqlx::query(
        "UPDATE guess_events SET user_id = ? WHERE challenge_id = ? AND player_id = (\
           SELECT primary_player_id FROM user_progress_profiles WHERE user_id = ?\
         )",
    )
    .bind(user_id)
    .bind(challenge_id.to_string())
    .bind(user_id)
    .execute(&mut *transaction)
    .await?;
    sqlx::query(
        "INSERT OR IGNORE INTO user_challenge_completions (user_id, challenge_id, completed_at) \
         SELECT ?, ?, MIN(created_at) FROM guess_events \
         WHERE user_id = ? AND challenge_id = ? AND is_correct = 1",
    )
    .bind(user_id)
    .bind(challenge_id.to_string())
    .bind(user_id)
    .bind(challenge_id.to_string())
    .execute(&mut *transaction)
    .await?;
    sqlx::query(
        "INSERT OR IGNORE INTO user_game_progress (user_id, game_type, difficulty, category, completed_at) \
         SELECT ?, 'classic', 'challenge', substr(mode, 9, length(mode) - 18), ? \
         FROM daily_challenges WHERE id = ? AND mode LIKE 'classic:%:challenge'",
    )
    .bind(user_id)
    .bind(now)
    .bind(challenge_id.to_string())
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    if completed_challenge_categories(pool, user_id).await? == CHALLENGE_CATEGORIES.len() as i64 {
        crate::auth::grant_hardcore_access(pool, user_id, now).await?;
    }
    Ok(())
}

async fn synchronize_completion_records(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user_id: &str,
    now: i64,
) -> AppResult<()> {
    sqlx::query(
        "INSERT OR IGNORE INTO user_challenge_completions (user_id, challenge_id, completed_at) \
         SELECT ?, g.challenge_id, MIN(g.created_at) FROM guess_events g \
         WHERE g.user_id = ? AND g.is_correct = 1 GROUP BY g.challenge_id",
    )
    .bind(user_id)
    .bind(user_id)
    .execute(&mut **transaction)
    .await?;
    sqlx::query(
        "INSERT OR IGNORE INTO user_game_progress (user_id, game_type, difficulty, category, completed_at) \
         SELECT ?, 'classic', 'challenge', \
           substr(d.mode, 9, length(d.mode) - 18), ? \
         FROM user_challenge_completions c JOIN daily_challenges d ON d.id = c.challenge_id \
         WHERE c.user_id = ? AND d.mode LIKE 'classic:%:challenge'",
    )
    .bind(user_id)
    .bind(now)
    .bind(user_id)
    .execute(&mut **transaction)
    .await?;
    sqlx::query(
        "INSERT OR IGNORE INTO timeline_user_completions (user_id, challenge_id, completed_at) \
         SELECT ?, challenge_id, MIN(created_at) FROM timeline_attempts \
         WHERE user_id = ? AND is_correct = 1 GROUP BY challenge_id",
    )
    .bind(user_id)
    .bind(user_id)
    .execute(&mut **transaction)
    .await?;
    sqlx::query(
        "INSERT OR IGNORE INTO user_game_progress \
         (user_id, game_type, difficulty, category, completed_at) \
         SELECT ?, 'timeline', c.difficulty, 'timeline', MIN(a.created_at) \
         FROM timeline_attempts a JOIN timeline_challenges c ON c.id = a.challenge_id \
         WHERE a.user_id = ? AND a.is_correct = 1 GROUP BY c.difficulty",
    )
    .bind(user_id)
    .bind(user_id)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn completed_challenge_categories(pool: &SqlitePool, user_id: &str) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(DISTINCT category) FROM user_game_progress WHERE user_id = ? \
         AND game_type = 'classic' AND difficulty = 'challenge' \
         AND category IN ('llm', 'cv', 'nlp', 'od', 'classical-ml', 'filters')",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?)
}

async fn history_stats(
    pool: &SqlitePool,
    user_id: &str,
    mode_pattern: &str,
) -> AppResult<ProgressHistoryStats> {
    let rows = sqlx::query_as::<_, HistoryRow>(
        "SELECT d.id AS challenge_id, d.challenge_date, d.mode, COUNT(*) AS guess_count, \
         MAX(g.is_correct) AS solved FROM guess_events g JOIN daily_challenges d ON d.id = g.challenge_id \
         WHERE g.user_id = ? AND d.mode LIKE ? GROUP BY d.id, d.challenge_date, d.mode \
         ORDER BY d.challenge_date DESC",
    )
    .bind(user_id)
    .bind(mode_pattern)
    .fetch_all(pool)
    .await?;
    history_stats_from_rows(&rows, false)
}

fn history_stats_from_rows(
    rows: &[HistoryRow],
    _timeline_distribution: bool,
) -> AppResult<ProgressHistoryStats> {
    let solved = rows
        .iter()
        .filter(|row| row.solved != 0)
        .collect::<Vec<_>>();
    let mut distribution = default_distribution();
    for row in &solved {
        let bucket = if row.guess_count > 8 {
            "8+".to_owned()
        } else {
            row.guess_count.to_string()
        };
        *distribution.entry(bucket).or_default() += 1;
    }
    let dates = solved
        .iter()
        .map(|row| row.challenge_date.as_str())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>();
    let (current_streak, best_streak) = streaks(&dates)?;
    Ok(ProgressHistoryStats {
        current_streak,
        best_streak,
        games_played: solved.len() as i64,
        games_won: solved.len() as i64,
        guess_distribution: distribution,
    })
}

async fn player_stats_summary(pool: &SqlitePool, player_id: &str) -> AppResult<PlayerStatsSummary> {
    let rows = sqlx::query_as::<_, PlayerStatsSummaryRow>(
        "SELECT current_streak, best_streak, games_won FROM player_mode_stats \
         WHERE player_id = ? AND mode LIKE 'classic:%'",
    )
    .bind(player_id)
    .fetch_all(pool)
    .await?;
    Ok(PlayerStatsSummary {
        current_streak: rows.iter().map(|row| row.current_streak).max().unwrap_or(0),
        best_streak: rows.iter().map(|row| row.best_streak).max().unwrap_or(0),
        games_played: rows.iter().map(|row| row.games_won).sum(),
    })
}

fn default_distribution() -> BTreeMap<String, i64> {
    ["1", "2", "3", "4", "5", "6", "7", "8+"]
        .into_iter()
        .map(|key| (key.to_owned(), 0))
        .collect()
}

fn streaks(dates: &[&str]) -> AppResult<(i64, i64)> {
    let dates = dates
        .iter()
        .map(|date| {
            time::Date::parse(
                date,
                time::macros::format_description!("[year]-[month]-[day]"),
            )
            .map_err(|_| AppError::Unavailable("Stored challenge date is invalid.".to_owned()))
        })
        .collect::<AppResult<Vec<_>>>()?;
    let mut current = 0;
    let mut running = 0;
    let mut best = 0;
    for (index, date) in dates.iter().enumerate() {
        if index == 0 || dates[index - 1].previous_day() == Some(*date) {
            running += 1;
        } else {
            if current == 0 {
                current = running;
            }
            running = 1;
        }
        best = best.max(running);
    }
    if current == 0 {
        current = running;
    }
    Ok((current, best))
}

fn unix_millis(value: OffsetDateTime) -> AppResult<i64> {
    i64::try_from(value.unix_timestamp_nanos() / 1_000_000)
        .map_err(|_| AppError::validation("Progress timestamp is invalid."))
}

fn format_millis(value: i64) -> AppResult<String> {
    OffsetDateTime::from_unix_timestamp_nanos(i128::from(value) * 1_000_000)
        .map_err(|_| AppError::Unavailable("Stored progress timestamp is invalid.".to_owned()))?
        .format(&Rfc3339)
        .map_err(|_| AppError::Unavailable("Stored progress timestamp is invalid.".to_owned()))
}
