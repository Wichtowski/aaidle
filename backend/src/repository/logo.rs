use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use crate::{
    domain::logo::{
        LogoCatalog, LogoTextClue, MAX_REVEAL_REVISION, RevealProfile, reveal_revision,
        revealed_clues,
    },
    dto::{PlayerModeStats, PublicModel},
    error::{AppError, AppResult},
};

use super::{
    ChallengeRecord, PlayerEventTable, ensure_anonymous_player, now_unix_millis,
    update_player_stats,
};

const MODE: &str = "logo:normal";

#[derive(Clone, Debug, FromRow)]
pub struct LogoChallengeRecord {
    pub id: String,
    pub challenge_date: String,
    pub mode: String,
    pub answer_model_id: String,
    pub asset_path: String,
}

pub struct LogoGameData {
    pub challenge: LogoChallengeRecord,
    pub models: Vec<PublicModel>,
    pub progress: LogoProgress,
    pub completion_count: i64,
}

fn public_logo_model(entry: &crate::domain::logo::LogoCatalogEntry) -> PublicModel {
    PublicModel {
        id: entry.answer_id.clone(),
        name: entry.asset_name.clone(),
        provider_name: "Logo catalog".to_owned(),
        family_name: None,
        aliases: Vec::new(),
    }
}

#[derive(Clone)]
pub struct LogoProgress {
    pub image_url: String,
    pub reveal: RevealProfile,
    pub image_revision: usize,
    pub maximum_image_revision: usize,
    pub clues: Vec<LogoTextClue>,
    pub solved: bool,
    pub attribution: Option<String>,
}

pub struct LogoGuessInput {
    pub challenge_id: Uuid,
    pub player_id: Uuid,
    pub user_id: Option<String>,
    pub request_id: Uuid,
    pub guessed_model_id: String,
    pub attempt_number: u16,
}

pub struct LogoGuessOutcome {
    pub guessed_model: PublicModel,
    pub is_correct: bool,
    pub attempt_number: u16,
    pub progress: LogoProgress,
    pub completion_count: i64,
    pub player_stats: PlayerModeStats,
}

#[derive(Clone)]
pub struct LogoGuessHistoryEntry {
    pub model: PublicModel,
    pub is_correct: bool,
    pub attempt_number: u16,
}

pub struct LogoHistory {
    pub guesses: Vec<LogoGuessHistoryEntry>,
    pub progress: LogoProgress,
}

#[derive(FromRow)]
struct StoredGuess {
    guessed_model_id: String,
    attempt_number: i64,
    is_correct: i64,
}

pub async fn game(
    pool: &SqlitePool,
    catalog: &LogoCatalog,
    date: &str,
    difficulty: &str,
    secret: &str,
    player_id: Uuid,
) -> AppResult<LogoGameData> {
    if difficulty != "normal" {
        return Err(AppError::validation(
            "Only Normal Logo difficulty is currently available.",
        ));
    }
    let challenge = ensure_challenge(pool, catalog, date, secret).await?;
    let models = catalog
        .eligible(0)
        .map(public_logo_model)
        .collect::<Vec<_>>();
    let progress = progress(pool, catalog, &challenge, player_id).await?;
    Ok(LogoGameData {
        completion_count: completion_count(pool, &challenge.id).await?,
        challenge,
        models,
        progress,
    })
}

pub async fn history(
    pool: &SqlitePool,
    catalog: &LogoCatalog,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<LogoHistory> {
    let challenge = challenge_by_id(pool, challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Logo challenge not found.".to_owned()))?;
    let stored = sqlx::query_as::<_, StoredGuess>(
        "SELECT guessed_model_id, attempt_number, is_correct FROM logo_guess_events WHERE challenge_id = ? AND player_id = ? ORDER BY attempt_number, created_at",
    )
    .bind(challenge_id.to_string())
    .bind(player_id.to_string())
    .fetch_all(pool)
    .await?;
    let mut guesses = Vec::with_capacity(stored.len());
    for guess in stored {
        // Logo answers are maintained independently from the Classic model catalog.
        // Ignore guesses recorded by older builds that used Classic IDs; they cannot
        // be rendered as Logo answers and must not make the whole game unavailable.
        let Some(model) = catalog
            .entry(&guess.guessed_model_id)
            .map(public_logo_model)
        else {
            continue;
        };
        guesses.push(LogoGuessHistoryEntry {
            model,
            is_correct: guess.is_correct != 0,
            attempt_number: u16::try_from(guess.attempt_number)
                .map_err(|_| AppError::Unavailable("Stored Logo attempt is invalid.".to_owned()))?,
        });
    }
    Ok(LogoHistory {
        guesses,
        progress: progress(pool, catalog, &challenge, player_id).await?,
    })
}

pub async fn process_guess(
    pool: &SqlitePool,
    catalog: &LogoCatalog,
    input: LogoGuessInput,
) -> AppResult<LogoGuessOutcome> {
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
    catalog: &LogoCatalog,
    input: &LogoGuessInput,
) -> AppResult<LogoGuessOutcome> {
    if catalog
        .eligible(0)
        .all(|entry| entry.answer_id != input.guessed_model_id)
    {
        return Err(AppError::validation(
            "This model is not available in the Logo pool.",
        ));
    }
    let guessed_model = catalog
        .entry(&input.guessed_model_id)
        .map(public_logo_model)
        .ok_or_else(|| AppError::NotFound("Logo model not found.".to_owned()))?;
    let mut transaction = pool.begin().await?;
    let connection = &mut *transaction;
    let challenge = challenge_by_id(&mut *connection, input.challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Logo challenge not found.".to_owned()))?;
    if sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM logo_guess_events WHERE request_id = ?)",
    )
    .bind(input.request_id.to_string())
    .fetch_one(&mut *connection)
    .await?
        != 0
    {
        return Err(AppError::Conflict("DUPLICATE_GUESS".to_owned()));
    }
    if sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM logo_guess_events WHERE challenge_id = ? AND player_id = ? AND guessed_model_id = ?)",
    )
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .bind(&input.guessed_model_id)
    .fetch_one(&mut *connection)
    .await?
        != 0
    {
        return Err(AppError::Conflict("DUPLICATE_GUESS".to_owned()));
    }
    if sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM logo_guess_events WHERE challenge_id = ? AND player_id = ? AND is_correct = 1)",
    )
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .fetch_one(&mut *connection)
    .await?
        != 0
    {
        return Err(AppError::Conflict("CHALLENGE_COMPLETED".to_owned()));
    }
    let pool_size = i64::try_from(catalog.eligible(0).count())
        .map_err(|_| AppError::Unavailable("Logo attempt limit is invalid.".to_owned()))?;
    let stored_attempt_ids = sqlx::query_scalar::<_, String>(
        "SELECT guessed_model_id FROM logo_guess_events WHERE challenge_id = ? AND player_id = ?",
    )
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .fetch_all(&mut *connection)
    .await?;
    let accepted_attempts = i64::try_from(
        stored_attempt_ids
            .iter()
            .filter(|id| catalog.entry(id).is_some())
            .count(),
    )
    .map_err(|_| AppError::Unavailable("Logo attempt limit is invalid.".to_owned()))?;
    if accepted_attempts >= pool_size {
        return Err(AppError::Conflict("ATTEMPT_LIMIT_REACHED".to_owned()));
    }
    let expected_attempt = u16::try_from(accepted_attempts + 1)
        .map_err(|_| AppError::Unavailable("Logo attempt limit is invalid.".to_owned()))?;
    if input.attempt_number != expected_attempt {
        return Err(AppError::Conflict("STALE_GUESS_STATE".to_owned()));
    }
    let is_correct = input.guessed_model_id == challenge.answer_model_id;
    let now = now_unix_millis();
    ensure_anonymous_player(&mut *connection, input.player_id, now).await?;
    sqlx::query(
        "INSERT INTO logo_guess_events (id, request_id, challenge_id, player_id, user_id, guessed_model_id, attempt_number, is_correct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(input.request_id.to_string())
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .bind(&input.user_id)
    .bind(&input.guessed_model_id)
    .bind(i64::from(input.attempt_number))
    .bind(i64::from(u8::from(is_correct)))
    .bind(now)
    .execute(&mut *connection)
    .await?;
    let stats_challenge = ChallengeRecord {
        id: challenge.id.clone(),
        challenge_date: challenge.challenge_date.clone(),
        mode: challenge.mode.clone(),
        answer_model_id: challenge.answer_model_id.clone(),
    };
    let player_stats = update_player_stats(
        &mut *connection,
        PlayerEventTable::Logo,
        input.player_id,
        &stats_challenge,
        input.attempt_number,
        is_correct,
        now,
    )
    .await?;
    let completion_count = if is_correct {
        increment_completion_count(&mut *connection, &challenge.id).await?
    } else {
        completion_count(&mut *connection, &challenge.id).await?
    };
    let wrong = wrong_guess_count(&mut *connection, input.challenge_id, input.player_id).await?;
    let progress = progress_for_count(catalog, &challenge, wrong, is_correct)?;
    transaction.commit().await?;
    Ok(LogoGuessOutcome {
        guessed_model,
        is_correct,
        attempt_number: input.attempt_number,
        progress,
        completion_count,
        player_stats,
    })
}

async fn ensure_challenge(
    pool: &SqlitePool,
    catalog: &LogoCatalog,
    date: &str,
    secret: &str,
) -> AppResult<LogoChallengeRecord> {
    if let Some(challenge) = find_by_date(pool, date).await? {
        if catalog.entry(&challenge.answer_model_id).is_some() {
            return Ok(challenge);
        }
        let entry = catalog
            .eligible(0)
            .next()
            .ok_or_else(|| AppError::Unavailable("No Logo entries are configured.".to_owned()))?;
        sqlx::query(
            "UPDATE logo_challenges SET answer_model_id = ?, asset_path = ?, selection_version = selection_version + 1 WHERE id = ?",
        )
        .bind(&entry.answer_id)
        .bind(&entry.asset_path)
        .bind(&challenge.id)
        .execute(pool)
        .await?;
        return find_by_date(pool, date).await?.ok_or_else(|| {
            AppError::Unavailable("Today’s Logo challenge is unavailable.".to_owned())
        });
    }
    let recent = sqlx::query_scalar::<_, String>(
        "SELECT answer_model_id FROM logo_challenges WHERE mode = ? ORDER BY challenge_date DESC LIMIT 6",
    )
    .bind(MODE)
    .fetch_all(pool)
    .await?;
    let entry = catalog
        .eligible(0)
        .min_by_key(|entry| {
            (
                recent.contains(&entry.answer_id),
                stable_hash(&format!("{secret}:{date}:{MODE}:{}", entry.answer_id)),
            )
        })
        .ok_or_else(|| AppError::Unavailable("No Logo entries are configured.".to_owned()))?;
    sqlx::query(
        "INSERT INTO logo_challenges (id, challenge_date, mode, answer_model_id, asset_path, selection_version, generated_at) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(challenge_date, mode) DO NOTHING",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(date)
    .bind(MODE)
    .bind(&entry.answer_id)
        .bind(&entry.asset_path)
    .bind(now_unix_millis())
    .execute(pool)
    .await?;
    find_by_date(pool, date)
        .await?
        .ok_or_else(|| AppError::Unavailable("Today’s Logo challenge is unavailable.".to_owned()))
}

async fn find_by_date(pool: &SqlitePool, date: &str) -> AppResult<Option<LogoChallengeRecord>> {
    Ok(sqlx::query_as(
        "SELECT id, challenge_date, mode, answer_model_id, asset_path FROM logo_challenges WHERE challenge_date = ? AND mode = ?",
    )
    .bind(date)
    .bind(MODE)
    .fetch_optional(pool)
    .await?)
}

async fn challenge_by_id<'e, E>(
    executor: E,
    challenge_id: Uuid,
) -> AppResult<Option<LogoChallengeRecord>>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    Ok(sqlx::query_as(
        "SELECT id, challenge_date, mode, answer_model_id, asset_path FROM logo_challenges WHERE id = ? AND mode = ?",
    )
    .bind(challenge_id.to_string())
    .bind(MODE)
    .fetch_optional(executor)
    .await?)
}

async fn progress(
    pool: &SqlitePool,
    catalog: &LogoCatalog,
    challenge: &LogoChallengeRecord,
    player_id: Uuid,
) -> AppResult<LogoProgress> {
    let challenge_id = Uuid::parse_str(&challenge.id)
        .map_err(|_| AppError::Unavailable("Stored Logo challenge ID is invalid.".to_owned()))?;
    let wrong = wrong_guess_count(pool, challenge_id, player_id).await?;
    let solved = sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM logo_guess_events WHERE challenge_id = ? AND player_id = ? AND is_correct = 1)",
    )
    .bind(&challenge.id)
    .bind(player_id.to_string())
    .fetch_one(pool)
    .await?
        != 0;
    progress_for_count(catalog, challenge, wrong, solved)
}

fn progress_for_count(
    catalog: &LogoCatalog,
    challenge: &LogoChallengeRecord,
    wrong: usize,
    solved: bool,
) -> AppResult<LogoProgress> {
    let entry = catalog
        .entry(&challenge.answer_model_id)
        .ok_or_else(|| AppError::Unavailable("Logo challenge asset is unavailable.".to_owned()))?;
    Ok(LogoProgress {
        image_url: entry.asset_path.clone(),
        reveal: entry.reveal,
        image_revision: reveal_revision(wrong),
        maximum_image_revision: MAX_REVEAL_REVISION,
        clues: revealed_clues(entry, wrong),
        solved,
        attribution: solved
            .then(|| entry.attribution.clone())
            .filter(|attribution| !attribution.trim().is_empty()),
    })
}

async fn wrong_guess_count<'e, E>(
    executor: E,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<usize>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM logo_guess_events WHERE challenge_id = ? AND player_id = ? AND is_correct = 0",
    )
    .bind(challenge_id.to_string())
    .bind(player_id.to_string())
    .fetch_one(executor)
    .await?;
    usize::try_from(count)
        .map_err(|_| AppError::Unavailable("Logo reveal count is invalid.".to_owned()))
}

async fn completion_count<'e, E>(executor: E, challenge_id: &str) -> AppResult<i64>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(completion_count, 0) FROM logo_completion_counts WHERE challenge_id = ?",
    )
    .bind(challenge_id)
    .fetch_optional(executor)
    .await?
    .unwrap_or(0))
}

async fn increment_completion_count(
    connection: &mut SqliteConnection,
    challenge_id: &str,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        "INSERT INTO logo_completion_counts (challenge_id, completion_count) VALUES (?, 1) ON CONFLICT(challenge_id) DO UPDATE SET completion_count = completion_count + 1 RETURNING completion_count",
    )
    .bind(challenge_id)
    .fetch_one(connection)
    .await?)
}

fn stable_hash(value: &str) -> u32 {
    value.chars().fold(2_166_136_261_u32, |hash, character| {
        (hash ^ character as u32).wrapping_mul(16_777_619)
    })
}

pub async fn rebuild_player_stats(
    pool: &SqlitePool,
    player_id: Uuid,
    mode: &str,
    now: i64,
) -> AppResult<()> {
    super::rebuild_player_stats(pool, player_id, mode, now, PlayerEventTable::Logo).await
}

#[cfg(test)]
mod tests;
