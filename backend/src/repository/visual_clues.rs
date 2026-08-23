use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use crate::{
    domain::visual_clues::{
        ResolvedVisualClueVariant, VisualClue, VisualClueCatalog, VisualClueEntity,
        resolve_variant, stable_hash, weighted_variant_id,
    },
    dto::{EmojiCluesGuessHistoryEntry, PlayerModeStats},
    error::{AppError, AppResult},
};

use super::{PlayerEventTable, ensure_anonymous_player, now_unix_millis, update_player_stats};

const MODE_PREFIX: &str = "emoji-clues:";

#[derive(Clone, Debug, FromRow)]
pub struct VisualChallengeRecord {
    pub id: String,
    pub challenge_date: String,
    pub mode: String,
    pub answer_entity_id: String,
    pub variant_id: String,
}

pub struct VisualGameData {
    pub challenge: VisualChallengeRecord,
    pub clues: Vec<VisualClue>,
    pub maximum_clues: usize,
    pub entities: Vec<VisualClueEntity>,
    pub completion_count: i64,
}

pub struct VisualGuessInput {
    pub challenge_id: Uuid,
    pub player_id: Uuid,
    pub user_id: Option<String>,
    pub request_id: Uuid,
    pub guessed_entity_id: String,
    pub attempt_number: u16,
}

pub struct VisualGuessOutcome {
    pub entity: VisualClueEntity,
    pub is_correct: bool,
    pub attempt_number: u16,
    pub completion_count: i64,
    pub player_stats: PlayerModeStats,
    pub clues: Vec<VisualClue>,
}

#[derive(FromRow)]
struct VisualGuessHistoryRow {
    guessed_entity_id: String,
    attempt_number: i64,
    is_correct: i64,
}

pub fn difficulty_pool(value: &str) -> Option<u8> {
    match value {
        "normal" => Some(0),
        "challenge" => Some(1),
        "hardcore" => Some(2),
        _ => None,
    }
}

pub async fn game(
    pool: &SqlitePool,
    catalog: &VisualClueCatalog,
    date: &str,
    difficulty: &str,
    secret: &str,
) -> AppResult<VisualGameData> {
    let challenge = ensure_challenge(pool, catalog, date, difficulty, secret).await?;
    let entity = catalog
        .entity(&challenge.answer_entity_id)
        .ok_or_else(|| AppError::Unavailable("Visual Clue answer is unavailable.".to_owned()))?;
    let resolved = resolve_variant(entity, &challenge.variant_id)?;
    let pool_rank = difficulty_pool(difficulty).expect("validated difficulty");
    let entities = catalog.eligible(pool_rank).cloned().collect();
    Ok(VisualGameData {
        completion_count: completion_count(pool, &challenge.id).await?,
        challenge,
        clues: initial_clues(&resolved),
        maximum_clues: resolved.clues.len(),
        entities,
    })
}

pub async fn hints(
    pool: &SqlitePool,
    catalog: &VisualClueCatalog,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<Vec<VisualClue>> {
    let challenge = challenge_by_id(pool, challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Emoji Clues challenge not found.".to_owned()))?;
    let entity = catalog
        .entity(&challenge.answer_entity_id)
        .ok_or_else(|| AppError::Unavailable("Visual Clue answer is unavailable.".to_owned()))?;
    let resolved = resolve_variant(entity, &challenge.variant_id)?;
    let solved = sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM visual_clue_guess_events WHERE challenge_id = ? AND player_id = ? AND is_correct = 1)",
    ).bind(challenge_id.to_string()).bind(player_id.to_string()).fetch_one(pool).await? != 0;
    let wrong = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM visual_clue_guess_events WHERE challenge_id = ? AND player_id = ? AND is_correct = 0",
    ).bind(challenge_id.to_string()).bind(player_id.to_string()).fetch_one(pool).await? as usize;
    Ok(revealed_clues(
        &resolved,
        if solved {
            resolved.clues.len()
        } else {
            resolved.initial_reveal_count + wrong
        },
    ))
}

pub async fn guess_history(
    pool: &SqlitePool,
    catalog: &VisualClueCatalog,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<Vec<EmojiCluesGuessHistoryEntry>> {
    if challenge_by_id(pool, challenge_id).await?.is_none() {
        return Err(AppError::NotFound(
            "Emoji Clues challenge not found.".to_owned(),
        ));
    }
    let stored = sqlx::query_as::<_, VisualGuessHistoryRow>(
        "SELECT guessed_entity_id, attempt_number, is_correct \
         FROM visual_clue_guess_events WHERE challenge_id = ? AND player_id = ? \
         ORDER BY attempt_number, created_at",
    )
    .bind(challenge_id.to_string())
    .bind(player_id.to_string())
    .fetch_all(pool)
    .await?;

    let mut guesses = Vec::with_capacity(stored.len());
    for stored in stored {
        let entity = catalog.entity(&stored.guessed_entity_id).ok_or_else(|| {
            AppError::Unavailable("Stored Emoji Clues guess is unavailable.".to_owned())
        })?;
        guesses.push(EmojiCluesGuessHistoryEntry {
            id: entity.id.clone(),
            name: entity.name.clone(),
            is_correct: stored.is_correct != 0,
            attempt_number: stored.attempt_number as u16,
        });
    }
    Ok(guesses)
}

pub async fn process_guess(
    pool: &SqlitePool,
    catalog: &VisualClueCatalog,
    input: VisualGuessInput,
) -> AppResult<VisualGuessOutcome> {
    for attempt in 0..12 {
        match process_guess_once(pool, catalog, &input).await {
            Err(error) if super::is_sqlite_busy(&error) && attempt < 11 => {
                tokio::time::sleep(std::time::Duration::from_millis(10_u64 << attempt)).await;
            }
            result => return result,
        }
    }
    unreachable!("the retry loop always returns")
}

async fn process_guess_once(
    pool: &SqlitePool,
    catalog: &VisualClueCatalog,
    input: &VisualGuessInput,
) -> AppResult<VisualGuessOutcome> {
    let mut transaction = pool.begin().await?;
    let connection = &mut *transaction;
    let challenge = challenge_by_id(&mut *connection, input.challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Emoji Clues challenge not found.".to_owned()))?;
    if sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM visual_clue_guess_events WHERE request_id = ?)",
    )
    .bind(input.request_id.to_string())
    .fetch_one(&mut *connection)
    .await?
        != 0
    {
        return Err(AppError::Conflict("DUPLICATE_GUESS".to_owned()));
    }
    if sqlx::query_scalar::<_, i64>("SELECT EXISTS(SELECT 1 FROM visual_clue_guess_events WHERE challenge_id = ? AND player_id = ? AND guessed_entity_id = ?)")
        .bind(input.challenge_id.to_string()).bind(input.player_id.to_string()).bind(&input.guessed_entity_id).fetch_one(&mut *connection).await? != 0 {
        return Err(AppError::Conflict("DUPLICATE_GUESS".to_owned()));
    }
    if sqlx::query_scalar::<_, i64>("SELECT EXISTS(SELECT 1 FROM visual_clue_guess_events WHERE challenge_id = ? AND player_id = ? AND is_correct = 1)")
        .bind(input.challenge_id.to_string()).bind(input.player_id.to_string()).fetch_one(&mut *connection).await? != 0 {
        return Err(AppError::Conflict("CHALLENGE_COMPLETED".to_owned()));
    }
    let entity = catalog
        .entity(&input.guessed_entity_id)
        .cloned()
        .ok_or_else(|| AppError::validation("This answer is not in the Emoji Clues pool."))?;
    let difficulty = challenge
        .mode
        .strip_prefix(MODE_PREFIX)
        .and_then(difficulty_pool)
        .ok_or_else(|| {
            AppError::Unavailable("Emoji Clues challenge has an invalid mode.".to_owned())
        })?;
    if entity.min_pool > difficulty {
        return Err(AppError::validation(
            "This answer is not in the Emoji Clues pool.",
        ));
    }
    let pool_size = i64::try_from(catalog.eligible(difficulty).count())
        .map_err(|_| AppError::Unavailable("Emoji Clues attempt limit is invalid.".to_owned()))?;
    let accepted_attempts = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM visual_clue_guess_events WHERE challenge_id = ? AND player_id = ?",
    )
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .fetch_one(&mut *connection)
    .await?;
    if accepted_attempts >= pool_size {
        return Err(AppError::Conflict("ATTEMPT_LIMIT_REACHED".to_owned()));
    }
    let expected_attempt = u16::try_from(accepted_attempts + 1)
        .map_err(|_| AppError::Unavailable("Emoji Clues attempt limit is invalid.".to_owned()))?;
    if input.attempt_number != expected_attempt {
        return Err(AppError::validation(format!(
            "attemptNumber must be {expected_attempt}",
        )));
    }
    let is_correct = entity.id == challenge.answer_entity_id;
    let now = now_unix_millis();
    ensure_anonymous_player(&mut *connection, input.player_id, now).await?;
    sqlx::query("INSERT INTO visual_clue_guess_events (id, request_id, challenge_id, player_id, user_id, guessed_entity_id, attempt_number, is_correct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string()).bind(input.request_id.to_string()).bind(input.challenge_id.to_string()).bind(input.player_id.to_string()).bind(&input.user_id).bind(&entity.id).bind(i64::from(input.attempt_number)).bind(i64::from(u8::from(is_correct))).bind(now).execute(&mut *connection).await?;
    let classic_record = super::ChallengeRecord {
        id: challenge.id.clone(),
        challenge_date: challenge.challenge_date.clone(),
        mode: challenge.mode.clone(),
        answer_model_id: "visual-clues".to_owned(),
    };
    let player_stats = update_player_stats(
        &mut *connection,
        PlayerEventTable::VisualClues,
        input.player_id,
        &classic_record,
        input.attempt_number,
        is_correct,
        now,
    )
    .await?;
    let completion_count = if is_correct {
        increment_visual_completion_count(&mut *connection, &challenge.id).await?
    } else {
        completion_count(&mut *connection, &challenge.id).await?
    };
    let answer = catalog
        .entity(&challenge.answer_entity_id)
        .ok_or_else(|| AppError::Unavailable("Visual Clue answer is unavailable.".to_owned()))?;
    let resolved = resolve_variant(answer, &challenge.variant_id)?;
    let clues = revealed_clues(
        &resolved,
        if is_correct {
            resolved.clues.len()
        } else {
            resolved.initial_reveal_count
                + wrong_guess_count(&mut *connection, input.challenge_id, input.player_id).await?
        },
    );
    transaction.commit().await?;
    Ok(VisualGuessOutcome {
        entity,
        is_correct,
        attempt_number: input.attempt_number,
        completion_count,
        player_stats,
        clues,
    })
}

async fn ensure_challenge(
    pool: &SqlitePool,
    catalog: &VisualClueCatalog,
    date: &str,
    difficulty: &str,
    secret: &str,
) -> AppResult<VisualChallengeRecord> {
    let mode = format!("{MODE_PREFIX}{difficulty}");
    if let Some(challenge) = find_by_date_mode(pool, date, &mode).await? {
        return Ok(challenge);
    }
    let rank = difficulty_pool(difficulty)
        .ok_or_else(|| AppError::validation("Unknown Emoji Clues difficulty."))?;
    let entities = catalog.eligible(rank).collect::<Vec<_>>();
    let recent = sqlx::query_scalar::<_, String>("SELECT answer_entity_id FROM visual_clue_challenges WHERE mode = ? ORDER BY challenge_date DESC LIMIT 8").bind(&mode).fetch_all(pool).await?;
    let entity = entities
        .iter()
        .min_by_key(|entity| {
            (
                recent.contains(&entity.id),
                stable_hash(&format!("{secret}:{date}:{mode}:{}", entity.id)),
            )
        })
        .ok_or_else(|| {
            AppError::Unavailable("No Emoji Clues are configured for this difficulty.".to_owned())
        })?;
    let recent_variant = sqlx::query_scalar::<_, String>("SELECT variant_id FROM visual_clue_challenges WHERE answer_entity_id = ? ORDER BY challenge_date DESC LIMIT 1").bind(&entity.id).fetch_optional(pool).await?;
    let mut variant_id = weighted_variant_id(
        entity,
        rank,
        &format!("{secret}:{date}:{mode}:{}", entity.id),
    )?;
    if recent_variant.as_deref() == Some(&variant_id) {
        for salt in 1..=8 {
            let candidate = weighted_variant_id(
                entity,
                rank,
                &format!("{secret}:{date}:{mode}:{}:{salt}", entity.id),
            )?;
            if candidate != variant_id {
                variant_id = candidate;
                break;
            }
        }
    }
    sqlx::query("INSERT INTO visual_clue_challenges (id, challenge_date, mode, answer_entity_id, variant_id, selection_version, generated_at) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(challenge_date, mode) DO NOTHING")
        .bind(Uuid::new_v4().to_string()).bind(date).bind(&mode).bind(&entity.id).bind(variant_id).bind(now_unix_millis()).execute(pool).await?;
    find_by_date_mode(pool, date, &mode).await?.ok_or_else(|| {
        AppError::Unavailable("Today’s Emoji Clues challenge is unavailable.".to_owned())
    })
}

async fn find_by_date_mode(
    pool: &SqlitePool,
    date: &str,
    mode: &str,
) -> AppResult<Option<VisualChallengeRecord>> {
    Ok(sqlx::query_as("SELECT id, challenge_date, mode, answer_entity_id, variant_id FROM visual_clue_challenges WHERE challenge_date = ? AND mode = ?").bind(date).bind(mode).fetch_optional(pool).await?)
}
async fn challenge_by_id<'e, E: sqlx::Executor<'e, Database = sqlx::Sqlite>>(
    executor: E,
    id: Uuid,
) -> AppResult<Option<VisualChallengeRecord>> {
    Ok(sqlx::query_as("SELECT id, challenge_date, mode, answer_entity_id, variant_id FROM visual_clue_challenges WHERE id = ?").bind(id.to_string()).fetch_optional(executor).await?)
}
fn initial_clues(resolved: &ResolvedVisualClueVariant) -> Vec<VisualClue> {
    revealed_clues(resolved, resolved.initial_reveal_count)
}
fn revealed_clues(resolved: &ResolvedVisualClueVariant, count: usize) -> Vec<VisualClue> {
    resolved
        .clues
        .iter()
        .take(count.min(resolved.clues.len()))
        .cloned()
        .collect()
}
async fn wrong_guess_count(
    connection: &mut SqliteConnection,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<usize> {
    Ok(sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM visual_clue_guess_events WHERE challenge_id = ? AND player_id = ? AND is_correct = 0").bind(challenge_id.to_string()).bind(player_id.to_string()).fetch_one(connection).await? as usize)
}
async fn completion_count<'e, E: sqlx::Executor<'e, Database = sqlx::Sqlite>>(
    executor: E,
    id: &str,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>("SELECT COALESCE(completion_count, 0) FROM visual_clue_completion_counts WHERE challenge_id = ?").bind(id).fetch_optional(executor).await?.unwrap_or(0))
}
async fn increment_visual_completion_count(
    connection: &mut SqliteConnection,
    id: &str,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar("INSERT INTO visual_clue_completion_counts (challenge_id, completion_count) VALUES (?, 1) ON CONFLICT(challenge_id) DO UPDATE SET completion_count = completion_count + 1 RETURNING completion_count").bind(id).fetch_one(connection).await?)
}
