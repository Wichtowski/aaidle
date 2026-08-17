use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use crate::{
    domain::visual_clues::{
        ResolvedVisualClueVariant, RevealMode, VisualClue, VisualClueEntity, resolve_variant,
        stable_hash, weighted_variant_id,
    },
    dto::PlayerModeStats,
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

#[derive(Clone, Debug)]
pub struct VisualEntity {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub entity_kind: String,
    pub min_pool: u8,
    definition: VisualClueEntity,
}

pub struct VisualGameData {
    pub challenge: VisualChallengeRecord,
    pub clues: Vec<VisualClue>,
    pub reveal_mode: RevealMode,
    pub maximum_clues: usize,
    pub entities: Vec<VisualEntity>,
    pub completion_count: i64,
}

pub struct VisualGuessInput {
    pub challenge_id: Uuid,
    pub player_id: Uuid,
    pub request_id: Uuid,
    pub guessed_entity_id: String,
    pub attempt_number: u16,
}

pub struct VisualGuessOutcome {
    pub entity: VisualEntity,
    pub is_correct: bool,
    pub attempt_number: u16,
    pub completion_count: i64,
    pub player_stats: PlayerModeStats,
    pub clues: Vec<VisualClue>,
}

#[derive(FromRow)]
struct EntityRow {
    id: String,
    name: String,
    aliases_json: String,
    entity_kind: String,
    min_pool: i64,
    entity_json: String,
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
    date: &str,
    difficulty: &str,
    secret: &str,
) -> AppResult<VisualGameData> {
    let challenge = ensure_challenge(pool, date, difficulty, secret).await?;
    let entity = entity_by_id(pool, &challenge.answer_entity_id)
        .await?
        .ok_or_else(|| AppError::Unavailable("Visual Clue answer is unavailable.".to_owned()))?;
    let resolved = resolve_variant(&entity.definition, &challenge.variant_id)?;
    let pool_rank = difficulty_pool(difficulty).expect("validated difficulty");
    let entities = eligible_entities(pool, pool_rank).await?;
    Ok(VisualGameData {
        completion_count: completion_count(pool, &challenge.id).await?,
        challenge,
        clues: initial_clues(&resolved),
        reveal_mode: resolved.reveal_mode,
        maximum_clues: resolved.clues.len(),
        entities,
    })
}

pub async fn hints(
    pool: &SqlitePool,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<Vec<VisualClue>> {
    let challenge = challenge_by_id(pool, challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Emoji Clues challenge not found.".to_owned()))?;
    let entity = entity_by_id(pool, &challenge.answer_entity_id)
        .await?
        .ok_or_else(|| AppError::Unavailable("Visual Clue answer is unavailable.".to_owned()))?;
    let resolved = resolve_variant(&entity.definition, &challenge.variant_id)?;
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
            1 + wrong
        },
    ))
}

pub async fn process_guess(
    pool: &SqlitePool,
    input: VisualGuessInput,
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
    let entity = entity_by_id(&mut *connection, &input.guessed_entity_id)
        .await?
        .ok_or_else(|| AppError::validation("This answer is not in the Emoji Clues pool."))?;
    let difficulty = challenge
        .mode
        .strip_prefix(MODE_PREFIX)
        .and_then(difficulty_pool)
        .ok_or_else(|| {
            AppError::Unavailable("Emoji Clues challenge has an invalid mode.".to_owned())
        })?;
    if entity_pool(&entity)? > difficulty {
        return Err(AppError::validation(
            "This answer is not in the Emoji Clues pool.",
        ));
    }
    let is_correct = entity.id == challenge.answer_entity_id;
    let now = now_unix_millis();
    ensure_anonymous_player(&mut *connection, input.player_id, now).await?;
    sqlx::query("INSERT INTO visual_clue_guess_events (id, request_id, challenge_id, player_id, guessed_entity_id, attempt_number, is_correct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string()).bind(input.request_id.to_string()).bind(input.challenge_id.to_string()).bind(input.player_id.to_string()).bind(&entity.id).bind(i64::from(input.attempt_number)).bind(i64::from(u8::from(is_correct))).bind(now).execute(&mut *connection).await?;
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
    let answer = entity_by_id(&mut *connection, &challenge.answer_entity_id)
        .await?
        .ok_or_else(|| AppError::Unavailable("Visual Clue answer is unavailable.".to_owned()))?;
    let resolved = resolve_variant(&answer.definition, &challenge.variant_id)?;
    let clues = revealed_clues(
        &resolved,
        if is_correct {
            resolved.clues.len()
        } else {
            1 + wrong_guess_count(&mut *connection, input.challenge_id, input.player_id).await?
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
    let entities = eligible_entity_rows(pool, rank).await?;
    let recent = sqlx::query_scalar::<_, String>("SELECT answer_entity_id FROM visual_clue_challenges WHERE mode = ? ORDER BY challenge_date DESC LIMIT 8").bind(&mode).fetch_all(pool).await?;
    let entity = entities
        .iter()
        .min_by_key(|row| {
            (
                recent.contains(&row.id),
                stable_hash(&format!("{secret}:{date}:{mode}:{}", row.id)),
            )
        })
        .ok_or_else(|| {
            AppError::Unavailable("No Emoji Clues are configured for this difficulty.".to_owned())
        })?;
    let visual: VisualClueEntity = serde_json::from_str(&entity.entity_json)?;
    let recent_variant = sqlx::query_scalar::<_, String>("SELECT variant_id FROM visual_clue_challenges WHERE answer_entity_id = ? ORDER BY challenge_date DESC LIMIT 1").bind(&entity.id).fetch_optional(pool).await?;
    let mut variant_id = weighted_variant_id(
        &visual,
        rank,
        &format!("{secret}:{date}:{mode}:{}", entity.id),
    )?;
    if recent_variant.as_deref() == Some(&variant_id) {
        for salt in 1..=8 {
            let candidate = weighted_variant_id(
                &visual,
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
async fn entity_by_id<'e, E: sqlx::Executor<'e, Database = sqlx::Sqlite>>(
    executor: E,
    id: &str,
) -> AppResult<Option<VisualEntity>> {
    sqlx::query_as::<_, EntityRow>("SELECT id, name, aliases_json, entity_kind, min_pool, entity_json FROM visual_clue_entities WHERE id = ?")
        .bind(id)
        .fetch_optional(executor)
        .await?
        .map(row_entity)
        .transpose()
}
async fn eligible_entity_rows(pool: &SqlitePool, rank: u8) -> AppResult<Vec<EntityRow>> {
    Ok(sqlx::query_as("SELECT id, name, aliases_json, entity_kind, min_pool, entity_json FROM visual_clue_entities WHERE min_pool <= ? ORDER BY id").bind(i64::from(rank)).fetch_all(pool).await?)
}
async fn eligible_entities(pool: &SqlitePool, rank: u8) -> AppResult<Vec<VisualEntity>> {
    eligible_entity_rows(pool, rank)
        .await?
        .into_iter()
        .map(row_entity)
        .collect()
}
fn row_entity(row: EntityRow) -> AppResult<VisualEntity> {
    Ok(VisualEntity {
        id: row.id,
        name: row.name,
        aliases: serde_json::from_str(&row.aliases_json)?,
        entity_kind: row.entity_kind,
        min_pool: row.min_pool as u8,
        definition: serde_json::from_str(&row.entity_json)?,
    })
}
fn entity_pool(entity: &VisualEntity) -> AppResult<u8> {
    Ok(entity.min_pool)
}
fn initial_clues(resolved: &ResolvedVisualClueVariant) -> Vec<VisualClue> {
    revealed_clues(resolved, 1)
}
fn revealed_clues(resolved: &ResolvedVisualClueVariant, count: usize) -> Vec<VisualClue> {
    match resolved.reveal_mode {
        RevealMode::AllAtOnce => resolved.clues.clone(),
        RevealMode::Progressive => resolved
            .clues
            .iter()
            .take(count.min(resolved.clues.len()))
            .cloned()
            .collect(),
    }
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
