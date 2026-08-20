use std::collections::BTreeMap;

pub mod visual_clues;

use sqlx::{FromRow, SqliteConnection, SqlitePool};
use time::macros::format_description;
use time::{Date, OffsetDateTime, format_description::FormatItem};
use uuid::Uuid;

use crate::{
    domain::{
        comparison::{ComparableModel, ComparisonResult, MatchingValues, compare_models, matching_values},
        selection::{RecentAnswer, select_daily_model},
        streak::{PlayerStreak, update_streak},
    },
    dto::{ClassicGuessHistoryEntry, GuessedModel, PlayerModeStats, PublicModel},
    error::{AppError, AppResult},
};

const DATE_FORMAT: &[FormatItem<'static>] = format_description!("[year]-[month]-[day]");
const SELECTION_VERSION: i64 = 1;

#[derive(Clone, Debug, FromRow)]
pub struct ChallengeRecord {
    pub id: String,
    pub challenge_date: String,
    pub mode: String,
    pub answer_model_id: String,
}

#[derive(FromRow)]
struct PublicModelRow {
    id: String,
    name: String,
    provider_name: String,
    family_name: Option<String>,
    aliases: String,
}

#[derive(FromRow)]
struct ModelRow {
    id: String,
    name: String,
    provider: Option<String>,
    country: Option<String>,
    family: Option<String>,
    family_tokens_json: Option<String>,
    reasoning_support: String,
    weight_availability: Option<String>,
    release_date: Option<String>,
    release_year: Option<i64>,
    context_window_tokens: Option<i64>,
    category_details_json: Option<String>,
}

#[derive(Clone, Debug, FromRow)]
struct StoredGuessRow {
    challenge_id: String,
    player_id: String,
    guessed_model_id: String,
    attempt_number: i64,
    is_correct: i64,
    comparison_json: String,
}

#[derive(Clone, Debug, FromRow)]
struct StoredGuessHistoryRow {
    request_id: String,
    guessed_model_id: String,
    attempt_number: i64,
    is_correct: i64,
    comparison_json: String,
    created_at: i64,
}

#[derive(Clone, Debug, FromRow)]
struct PlayerStatsRow {
    mode: String,
    current_streak: i64,
    best_streak: i64,
    games_played: i64,
    games_won: i64,
    last_played_date: Option<String>,
    last_solved_date: Option<String>,
    guess_distribution_json: String,
}

#[derive(FromRow)]
pub struct AggregateStats {
    pub total_guesses: i64,
    pub unique_players: i64,
    pub correct_guesses: i64,
}

pub struct GuessInput {
    pub challenge_id: Uuid,
    pub player_id: Uuid,
    pub request_id: Uuid,
    pub guessed_model_id: String,
    pub attempt_number: u16,
}

pub struct GuessOutcome {
    pub guessed_model: GuessedModel,
    pub comparison: BTreeMap<String, ComparisonResult>,
    pub matching: MatchingValues,
    pub is_correct: bool,
    pub attempt_number: u16,
    pub player_stats: PlayerModeStats,
    pub completion_count: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClassicCategory {
    Llm,
    Cv,
    Nlp,
    ObjectDetection,
    ClassicalMl,
    Filters,
    Hardcore,
}

impl ClassicCategory {
    pub const ALL: [Self; 7] = [
        Self::Llm,
        Self::Cv,
        Self::Nlp,
        Self::ObjectDetection,
        Self::ClassicalMl,
        Self::Filters,
        Self::Hardcore,
    ];

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "llm" => Some(Self::Llm),
            "cv" => Some(Self::Cv),
            "nlp" => Some(Self::Nlp),
            "object-detection" | "od" => Some(Self::ObjectDetection),
            "classical-ml" => Some(Self::ClassicalMl),
            "filters" | "image-processing" => Some(Self::Filters),
            "hardcore" => Some(Self::Hardcore),
            _ => None,
        }
    }

    fn mode_segment(self) -> &'static str {
        match self {
            Self::Llm => "llm",
            Self::Cv => "cv",
            Self::Nlp => "nlp",
            Self::ObjectDetection => "od",
            Self::ClassicalMl => "classical-ml",
            Self::Filters => "filters",
            Self::Hardcore => "hardcore",
        }
    }

    pub fn path_segment(self) -> &'static str {
        self.mode_segment()
    }

    fn catalog_slug(self) -> Option<&'static str> {
        match self {
            Self::Llm => Some("language-model"),
            Self::Cv => Some("computer-vision"),
            Self::Nlp => Some("nlp"),
            Self::ObjectDetection => Some("object-detection"),
            Self::ClassicalMl => Some("classical-ml"),
            Self::Filters => Some("filters"),
            Self::Hardcore => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClassicDifficulty {
    Normal,
    Challenge,
    Hardcore,
}

impl ClassicDifficulty {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "normal" => Some(Self::Normal),
            "challenge" => Some(Self::Challenge),
            "hardcore" => Some(Self::Hardcore),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Challenge => "challenge",
            Self::Hardcore => "hardcore",
        }
    }
}

pub struct ClassicGameData {
    pub challenge: ChallengeRecord,
    pub models: Vec<PublicModel>,
    pub columns: Vec<&'static str>,
    pub completion_count: i64,
}

#[derive(Clone, Copy)]
enum PlayerEventTable {
    Classic,
    VisualClues,
}

impl PlayerEventTable {
    fn count_query(self) -> &'static str {
        match self {
            Self::Classic => {
                "SELECT COUNT(*) FROM guess_events WHERE challenge_id = ? AND player_id = ?"
            }
            Self::VisualClues => {
                "SELECT COUNT(*) FROM visual_clue_guess_events WHERE challenge_id = ? AND player_id = ?"
            }
        }
    }
}

pub async fn list_public_models(
    pool: &SqlitePool,
    cursor: Option<&str>,
    page_size: i64,
) -> AppResult<(Vec<PublicModel>, Option<String>)> {
    let rows = sqlx::query_as::<_, PublicModelRow>(
        "SELECT m.id, m.name, p.name AS provider_name, f.name AS family_name, \
         COALESCE((SELECT group_concat(alias, char(31)) FROM model_aliases WHERE model_id = m.id), '') AS aliases \
         FROM models m JOIN providers p ON p.id = m.provider_id \
         LEFT JOIN model_families f ON f.id = m.family_id \
         WHERE m.is_guessable = 1 AND m.status != 'unavailable' AND m.id > ? \
         ORDER BY m.id LIMIT ?",
    )
    .bind(cursor.unwrap_or(""))
    .bind(page_size + 1)
    .fetch_all(pool)
    .await?;

    let has_more = rows.len() > page_size as usize;
    let rows = rows
        .into_iter()
        .take(page_size as usize)
        .collect::<Vec<_>>();
    let next_cursor = has_more
        .then(|| rows.last().map(|row| row.id.clone()))
        .flatten();
    let models = rows
        .into_iter()
        .map(|row| PublicModel {
            id: row.id,
            name: row.name,
            provider_name: row.provider_name,
            family_name: row.family_name,
            aliases: split_aliases(row.aliases),
        })
        .collect();
    Ok((models, next_cursor))
}

async fn public_models_by_ids(
    pool: &SqlitePool,
    model_ids: &[String],
) -> AppResult<Vec<PublicModel>> {
    let mut models = Vec::with_capacity(model_ids.len());
    for model_id in model_ids {
        let row = sqlx::query_as::<_, PublicModelRow>(
            "SELECT m.id, m.name, p.name AS provider_name, f.name AS family_name, \
             COALESCE((SELECT group_concat(alias, char(31)) FROM model_aliases WHERE model_id = m.id), '') AS aliases \
             FROM models m JOIN providers p ON p.id = m.provider_id \
             LEFT JOIN model_families f ON f.id = m.family_id \
             WHERE m.id = ? AND m.is_guessable = 1 AND m.status = 'active'",
        )
        .bind(model_id)
        .fetch_optional(pool)
        .await?;
        let row = row.ok_or_else(|| {
            AppError::Unavailable("A Classic model is no longer available.".to_owned())
        })?;
        models.push(PublicModel {
            id: row.id,
            name: row.name,
            provider_name: row.provider_name,
            family_name: row.family_name,
            aliases: split_aliases(row.aliases),
        });
    }
    models.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(models)
}

async fn classic_eligible_model_ids(
    pool: &SqlitePool,
    category: ClassicCategory,
    difficulty: ClassicDifficulty,
) -> AppResult<Vec<String>> {
    let all =
        match category.catalog_slug() {
            Some(category_slug) => {
                sqlx::query_scalar::<_, String>(
                    "SELECT m.id FROM models m JOIN model_categories mc ON mc.model_id = m.id \
             JOIN categories c ON c.id = mc.category_id \
             WHERE m.is_guessable = 1 AND m.status = 'active' AND c.slug = ? ORDER BY m.id",
                )
                .bind(category_slug)
                .fetch_all(pool)
                .await?
            }
            None => sqlx::query_scalar::<_, String>(
                "SELECT id FROM models WHERE is_guessable = 1 AND status = 'active' ORDER BY id",
            )
            .fetch_all(pool)
            .await?,
        };
    if category == ClassicCategory::Hardcore || difficulty != ClassicDifficulty::Normal {
        return Ok(all);
    }
    let normal = match category.catalog_slug() {
        Some(category_slug) => {
            sqlx::query_scalar::<_, String>(
                "SELECT m.id FROM models m JOIN model_categories mc ON mc.model_id = m.id \
             JOIN categories c ON c.id = mc.category_id \
             LEFT JOIN model_game_metadata g ON g.model_id = m.id \
             WHERE m.is_guessable = 1 AND m.status = 'active' AND c.slug = ? \
             AND COALESCE(g.min_pool_rank, 0) <= 0 ORDER BY m.id",
            )
            .bind(category_slug)
            .fetch_all(pool)
            .await?
        }
        None => unreachable!("hardcore cannot use the normal pool"),
    };
    if normal.len() >= 8 {
        return Ok(normal);
    }
    let fallback_count = 8_usize.max((all.len() * 2).div_ceil(5));
    Ok(all.into_iter().take(fallback_count).collect())
}

fn classic_columns(category: ClassicCategory, difficulty: ClassicDifficulty) -> Vec<&'static str> {
    let columns = match category {
        ClassicCategory::Llm => vec![
            "provider",
            "country",
            "family",
            "inputModalities",
            "outputModalities",
            "useCases",
            "release",
            "weightAvailability",
            "reasoningSupport",
            "contextWindowTokens",
            "toolUse",
            "multimodal",
        ],
        ClassicCategory::Cv => vec![
            "provider",
            "country",
            "family",
            "inputModalities",
            "outputModalities",
            "useCases",
            "release",
            "weightAvailability",
            "visionTasks",
            "architecture",
            "trainingDatasets",
            "license",
        ],
        ClassicCategory::Nlp => vec![
            "provider",
            "country",
            "family",
            "inputModalities",
            "outputModalities",
            "useCases",
            "release",
            "weightAvailability",
            "contextWindowTokens",
            "nlpTasks",
            "supportedLanguages",
            "architecture",
            "trainingDatasets",
        ],
        ClassicCategory::ObjectDetection => vec![
            "provider",
            "country",
            "family",
            "inputModalities",
            "outputModalities",
            "useCases",
            "release",
            "weightAvailability",
            "detectionTypes",
            "architecture",
            "trainingDatasets",
            "realTimeCapable",
        ],
        ClassicCategory::ClassicalMl => vec![
            "provider",
            "country",
            "family",
            "inputModalities",
            "outputModalities",
            "useCases",
            "release",
            "weightAvailability",
            "algorithmTypes",
            "learningParadigms",
            "objectives",
            "featureTypes",
            "frameworks",
        ],
        ClassicCategory::Filters => vec![
            "provider",
            "country",
            "family",
            "release",
            "operationTypes",
            "kernelBased",
            "kernelSizes",
            "linearity",
            "requiresTraining",
            "outputTypes",
            "frameworks",
            "outputModalities",
        ],
        ClassicCategory::Hardcore => vec![
            "categories",
            "inputModalities",
            "outputModalities",
            "useCases",
            "release",
            "contextWindowTokens",
            "weightAvailability",
            "supportedLanguages",
            "toolUse",
            "multimodal",
            "architecture",
            "trainingDatasets",
            "nlpTasks",
            "kernelSizes",
            "requiresTraining",
        ],
    };
    if difficulty == ClassicDifficulty::Normal {
        columns
    } else {
        columns
            .into_iter()
            .filter(|column| *column != "country")
            .collect()
    }
}

pub async fn ensure_daily_challenge(
    pool: &SqlitePool,
    date: &str,
    mode: &str,
    secret: &str,
    cooldown_days: i64,
) -> AppResult<ChallengeRecord> {
    let model_ids = sqlx::query_scalar::<_, String>(
        "SELECT id FROM models WHERE is_guessable = 1 AND status = 'active' ORDER BY id",
    )
    .fetch_all(pool)
    .await?;
    ensure_daily_challenge_for_models(pool, date, mode, &model_ids, secret, cooldown_days).await
}

pub async fn ensure_daily_challenge_for_models(
    pool: &SqlitePool,
    date: &str,
    mode: &str,
    model_ids: &[String],
    secret: &str,
    cooldown_days: i64,
) -> AppResult<ChallengeRecord> {
    if let Some(challenge) = find_challenge_by_date_and_mode(pool, date, mode).await? {
        return Ok(challenge);
    }
    let recent_answers = sqlx::query_as::<_, RecentAnswerRow>(
        "SELECT answer_model_id AS model_id, challenge_date \
         FROM daily_challenges WHERE mode = ? ORDER BY challenge_date DESC LIMIT ?",
    )
    .bind(mode)
    .bind(cooldown_days + 1)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| RecentAnswer {
        model_id: row.model_id,
        challenge_date: row.challenge_date,
    })
    .collect::<Vec<_>>();
    let answer_model_id = select_daily_model(
        date,
        mode,
        SELECTION_VERSION,
        secret,
        model_ids,
        &recent_answers,
        cooldown_days as usize,
    )?;
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO daily_challenges \
         (id, challenge_date, mode, answer_model_id, selection_version, generated_at, generation_source) \
         VALUES (?, ?, ?, ?, ?, ?, 'lazy') ON CONFLICT(challenge_date, mode) DO NOTHING",
    )
    .bind(id.to_string())
    .bind(date)
    .bind(mode)
    .bind(answer_model_id)
    .bind(SELECTION_VERSION)
    .bind(now_unix_millis())
    .execute(pool)
    .await?;

    find_challenge_by_date_and_mode(pool, date, mode)
        .await?
        .ok_or_else(|| AppError::Unavailable("Today’s challenge is unavailable.".to_owned()))
}

pub async fn classic_game(
    pool: &SqlitePool,
    date: &str,
    category: ClassicCategory,
    difficulty: ClassicDifficulty,
    secret: &str,
    cooldown_days: i64,
) -> AppResult<ClassicGameData> {
    if (category == ClassicCategory::Hardcore) != (difficulty == ClassicDifficulty::Hardcore) {
        return Err(AppError::validation(
            "hardcore category requires hardcore difficulty",
        ));
    }
    let model_ids = classic_eligible_model_ids(pool, category, difficulty).await?;
    let mode = format!(
        "classic:{}:{}",
        category.mode_segment(),
        difficulty.as_str()
    );
    let challenge =
        ensure_daily_challenge_for_models(pool, date, &mode, &model_ids, secret, cooldown_days)
            .await?;
    let models = public_models_by_ids(pool, &model_ids).await?;
    Ok(ClassicGameData {
        completion_count: completion_count(pool, &challenge.id).await?,
        challenge,
        models,
        columns: classic_columns(category, difficulty),
    })
}

pub async fn classic_trajectory(
    pool: &SqlitePool,
    challenge_id: Uuid,
) -> AppResult<(ChallengeRecord, Vec<GuessedModel>)> {
    let challenge = find_challenge(pool, challenge_id)
        .await?
        .filter(|challenge| parse_classic_mode(&challenge.mode).is_some())
        .ok_or_else(|| AppError::NotFound("Classic challenge not found.".to_owned()))?;
    let (category, difficulty) =
        parse_classic_mode(&challenge.mode).expect("classic challenge mode was checked");
    let ids = classic_eligible_model_ids(pool, category, difficulty).await?;
    let mut connection = pool.acquire().await?;
    let mut models = Vec::with_capacity(ids.len());
    for model_id in ids {
        if let Some(model) = load_model(&mut connection, &model_id, true).await? {
            models.push(model.public);
        }
    }
    models.sort_by(|left, right| left.name.cmp(&right.name));
    Ok((challenge, models))
}

pub async fn process_guess(pool: &SqlitePool, input: GuessInput) -> AppResult<GuessOutcome> {
    for attempt in 0..12 {
        match process_guess_once(pool, &input).await {
            Err(error) if is_sqlite_busy(&error) && attempt < 11 => {
                tokio::time::sleep(std::time::Duration::from_millis(10_u64 << attempt)).await;
            }
            result => return result,
        }
    }
    unreachable!("the retry loop always returns")
}

async fn process_guess_once(pool: &SqlitePool, input: &GuessInput) -> AppResult<GuessOutcome> {
    let mut transaction = pool.begin().await?;
    let connection = &mut *transaction;
    if let Some(stored) = find_guess_by_request_id(connection, input.request_id).await? {
        let outcome = replay_guess(connection, stored, input).await?;
        transaction.commit().await?;
        return Ok(outcome);
    }

    let challenge = find_challenge(&mut *connection, input.challenge_id).await?;
    if challenge.is_none() {
        return Err(AppError::NotFound("Challenge not found.".to_owned()));
    }
    let challenge = challenge.expect("checked above");
    if !is_classic_challenge_mode(&challenge.mode) {
        return Err(AppError::NotFound(
            "Classic challenge not found.".to_owned(),
        ));
    }
    if let Some(stored) = sqlx::query_as::<_, StoredGuessRow>(
        "SELECT challenge_id, player_id, guessed_model_id, attempt_number, is_correct, comparison_json \
         FROM guess_events WHERE challenge_id = ? AND player_id = ? AND guessed_model_id = ?",
    )
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .bind(&input.guessed_model_id)
    .fetch_optional(&mut *connection)
    .await?
    {
        let outcome = replay_stored_guess(connection, stored, input.challenge_id, input.player_id).await?;
        transaction.commit().await?;
        return Ok(outcome);
    }
    if sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM guess_events WHERE challenge_id = ? AND player_id = ? AND is_correct = 1)",
    )
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .fetch_one(&mut *connection)
    .await?
        != 0
    {
        return Err(AppError::Conflict("CHALLENGE_COMPLETED".to_owned()));
    }

    let guessed = load_model(connection, &input.guessed_model_id, true)
        .await?
        .ok_or_else(|| {
            AppError::NotFound("Guessed model not found or is unavailable.".to_owned())
        })?;
    if !is_model_eligible_for_challenge(connection, &challenge, &input.guessed_model_id).await? {
        return Err(AppError::validation(
            "This model is not available in this Classic difficulty.",
        ));
    }
    let answer = load_model(connection, &challenge.answer_model_id, false)
        .await?
        .ok_or_else(|| AppError::Unavailable("Challenge answer is unavailable.".to_owned()))?;
    let full_comparison = compare_models(&guessed.comparable, &answer.comparable);
    let matching = matching_values(&guessed.comparable, &answer.comparable);
    let comparison = parse_classic_mode(&challenge.mode)
        .map(|(category, difficulty)| {
            full_comparison.selected(&classic_columns(category, difficulty))
        })
        .unwrap_or_default();
    let is_correct = guessed.comparable.id == answer.comparable.id;
    let now = now_unix_millis();

    sqlx::query(
        "INSERT INTO anonymous_players (id, created_at, last_seen_at) VALUES (?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at",
    )
    .bind(input.player_id.to_string())
    .bind(now)
    .bind(now)
    .execute(&mut *connection)
    .await?;

    let comparison_json = serde_json::to_string(&comparison)?;
    let inserted = sqlx::query(
        "INSERT INTO guess_events \
         (id, request_id, challenge_id, player_id, guessed_model_id, attempt_number, is_correct, comparison_json, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(input.request_id.to_string())
    .bind(input.challenge_id.to_string())
    .bind(input.player_id.to_string())
    .bind(&input.guessed_model_id)
    .bind(i64::from(input.attempt_number))
    .bind(i64::from(u8::from(is_correct)))
    .bind(comparison_json)
    .bind(now)
    .execute(&mut *connection)
    .await?
    .rows_affected();

    if inserted == 0 {
        if let Some(stored) = find_guess_by_request_id(connection, input.request_id).await? {
            let outcome = replay_guess(connection, stored, input).await?;
            transaction.commit().await?;
            return Ok(outcome);
        }
        return Err(AppError::Conflict("DUPLICATE_GUESS".to_owned()));
    }

    sqlx::query(
        "INSERT INTO challenge_guess_stats \
         (challenge_id, guessed_model_id, total_guess_count, unique_player_count, correct_guess_count, updated_at) \
         VALUES (?, ?, 1, 1, ?, ?) \
         ON CONFLICT(challenge_id, guessed_model_id) DO UPDATE SET \
         total_guess_count = total_guess_count + 1, \
         correct_guess_count = correct_guess_count + excluded.correct_guess_count, \
         updated_at = excluded.updated_at",
    )
    .bind(input.challenge_id.to_string())
    .bind(&input.guessed_model_id)
    .bind(i64::from(u8::from(is_correct)))
    .bind(now)
    .execute(&mut *connection)
    .await?;

    let player_stats = update_player_stats(
        connection,
        PlayerEventTable::Classic,
        input.player_id,
        &challenge,
        input.attempt_number,
        is_correct,
        now,
    )
    .await?;
    let completion_count = if is_correct {
        increment_completion_count(connection, &challenge.id).await?
    } else {
        completion_count(connection, &challenge.id).await?
    };
    transaction.commit().await?;
    Ok(GuessOutcome {
        guessed_model: guessed.public,
        comparison,
        matching,
        is_correct,
        attempt_number: input.attempt_number,
        player_stats,
        completion_count,
    })
}

pub async fn challenge_stats(pool: &SqlitePool, challenge_id: Uuid) -> AppResult<AggregateStats> {
    if find_challenge(pool, challenge_id).await?.is_none() {
        return Err(AppError::NotFound("Challenge not found.".to_owned()));
    }
    Ok(sqlx::query_as::<_, AggregateStats>(
        "SELECT COUNT(*) AS total_guesses, COUNT(DISTINCT player_id) AS unique_players, \
         COALESCE(SUM(is_correct), 0) AS correct_guesses FROM guess_events WHERE challenge_id = ?",
    )
    .bind(challenge_id.to_string())
    .fetch_one(pool)
    .await?)
}

pub async fn classic_guess_history(
    pool: &SqlitePool,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<Vec<ClassicGuessHistoryEntry>> {
    let challenge = find_challenge(pool, challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Challenge not found.".to_owned()))?;
    let mut connection = pool.acquire().await?;
    let answer = load_model(&mut connection, &challenge.answer_model_id, false)
        .await?
        .ok_or_else(|| AppError::Unavailable("Challenge answer is unavailable.".to_owned()))?;
    let stored = sqlx::query_as::<_, StoredGuessHistoryRow>(
        "SELECT request_id, guessed_model_id, attempt_number, is_correct, comparison_json, created_at \
         FROM guess_events WHERE challenge_id = ? AND player_id = ? ORDER BY attempt_number, created_at",
    )
    .bind(challenge_id.to_string())
    .bind(player_id.to_string())
    .fetch_all(&mut *connection)
    .await?;

    let mut guesses = Vec::with_capacity(stored.len());
    for stored in stored {
        let request_id = Uuid::parse_str(&stored.request_id)
            .map_err(|_| AppError::Unavailable("Stored guess request ID is invalid.".to_owned()))?;
        let guessed = load_model(&mut connection, &stored.guessed_model_id, false)
            .await?
            .ok_or_else(|| AppError::Unavailable("Stored guessed model is unavailable.".to_owned()))?;
        let matching = matching_values(&guessed.comparable, &answer.comparable);
        guesses.push(ClassicGuessHistoryEntry {
            request_id,
            attempted_at: stored.created_at,
            guessed_model: guessed.public,
            comparison: serde_json::from_str(&stored.comparison_json)?,
            matching_family: matching.family,
            matching_categories: matching.categories,
            matching_input_modalities: matching.input_modalities,
            matching_output_modalities: matching.output_modalities,
            matching_use_cases: matching.use_cases,
            is_correct: stored.is_correct != 0,
            attempt_number: stored.attempt_number as u16,
        });
    }
    Ok(guesses)
}

pub async fn player_stats(pool: &SqlitePool, player_id: Uuid) -> AppResult<Vec<PlayerModeStats>> {
    let rows = sqlx::query_as::<_, PlayerStatsRow>(
        "SELECT mode, current_streak, best_streak, games_played, games_won, last_played_date, \
         last_solved_date, guess_distribution_json FROM player_mode_stats WHERE player_id = ? ORDER BY mode",
    )
    .bind(player_id.to_string())
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(player_stats_dto)
        .collect::<AppResult<_>>()
}

async fn find_challenge_by_date_and_mode(
    pool: &SqlitePool,
    date: &str,
    mode: &str,
) -> AppResult<Option<ChallengeRecord>> {
    Ok(sqlx::query_as::<_, ChallengeRecord>(
        "SELECT id, challenge_date, mode, answer_model_id FROM daily_challenges WHERE challenge_date = ? AND mode = ?",
    )
    .bind(date)
    .bind(mode)
    .fetch_optional(pool)
    .await?)
}

fn is_sqlite_busy(error: &AppError) -> bool {
    match error {
        AppError::Database(sqlx::Error::Database(database_error)) => {
            matches!(
                database_error.code().as_deref(),
                Some("5") | Some("517") | Some("SQLITE_BUSY") | Some("SQLITE_BUSY_SNAPSHOT")
            ) || database_error.message().contains("database is locked")
        }
        _ => false,
    }
}

async fn ensure_anonymous_player(
    connection: &mut SqliteConnection,
    player_id: Uuid,
    now: i64,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO anonymous_players (id, created_at, last_seen_at) VALUES (?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at",
    )
    .bind(player_id.to_string())
    .bind(now)
    .bind(now)
    .execute(connection)
    .await?;
    Ok(())
}

async fn completion_count(
    connection: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
    challenge_id: &str,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(completion_count, 0) FROM challenge_completion_counts WHERE challenge_id = ?",
    )
    .bind(challenge_id)
    .fetch_optional(connection)
    .await?
    .unwrap_or(0))
}

async fn increment_completion_count(
    connection: &mut SqliteConnection,
    challenge_id: &str,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        "INSERT INTO challenge_completion_counts (challenge_id, completion_count) VALUES (?, 1) \
         ON CONFLICT(challenge_id) DO UPDATE SET completion_count = completion_count + 1 \
         RETURNING completion_count",
    )
    .bind(challenge_id)
    .fetch_one(connection)
    .await?)
}

async fn find_challenge(
    connection: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
    challenge_id: Uuid,
) -> AppResult<Option<ChallengeRecord>> {
    Ok(sqlx::query_as::<_, ChallengeRecord>(
        "SELECT id, challenge_date, mode, answer_model_id FROM daily_challenges WHERE id = ?",
    )
    .bind(challenge_id.to_string())
    .fetch_optional(connection)
    .await?)
}

fn is_classic_challenge_mode(mode: &str) -> bool {
    mode == "classic" || parse_classic_mode(mode).is_some()
}

fn parse_classic_mode(mode: &str) -> Option<(ClassicCategory, ClassicDifficulty)> {
    let mut parts = mode.split(':');
    (parts.next()? == "classic").then_some(())?;
    let category = ClassicCategory::parse(parts.next()?)?;
    let difficulty = ClassicDifficulty::parse(parts.next()?)?;
    parts.next().is_none().then_some((category, difficulty))
}

async fn is_model_eligible_for_challenge(
    connection: &mut SqliteConnection,
    challenge: &ChallengeRecord,
    model_id: &str,
) -> AppResult<bool> {
    let Some((category, difficulty)) = parse_classic_mode(&challenge.mode) else {
        return Ok(challenge.mode == "classic");
    };
    let category_matches = match category.catalog_slug() {
        Some(category_slug) => sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM model_categories mc JOIN categories c ON c.id = mc.category_id \
             WHERE mc.model_id = ? AND c.slug = ?)",
        )
        .bind(model_id)
        .bind(category_slug)
        .fetch_one(&mut *connection)
        .await?
            != 0,
        None => true,
    };
    if !category_matches {
        return Ok(false);
    }
    if category == ClassicCategory::Hardcore || difficulty != ClassicDifficulty::Normal {
        return Ok(true);
    }
    let normal_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM models m JOIN model_categories mc ON mc.model_id = m.id \
         JOIN categories c ON c.id = mc.category_id LEFT JOIN model_game_metadata g ON g.model_id = m.id \
         WHERE m.is_guessable = 1 AND m.status = 'active' AND c.slug = ? AND COALESCE(g.min_pool_rank, 0) <= 0",
    )
    .bind(category.catalog_slug().expect("focused category has a slug"))
    .fetch_one(&mut *connection)
    .await?;
    if normal_count >= 8 {
        return Ok(sqlx::query_scalar::<_, i64>(
            "SELECT COALESCE(min_pool_rank, 0) <= 0 FROM model_game_metadata WHERE model_id = ?",
        )
        .bind(model_id)
        .fetch_optional(&mut *connection)
        .await?
        .unwrap_or(1)
            != 0);
    }
    let total_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM models m JOIN model_categories mc ON mc.model_id = m.id \
         JOIN categories c ON c.id = mc.category_id WHERE m.is_guessable = 1 AND m.status = 'active' AND c.slug = ?",
    )
    .bind(category.catalog_slug().expect("focused category has a slug"))
    .fetch_one(&mut *connection)
    .await?;
    let fallback_count = 8_i64.max((total_count * 2 + 4) / 5);
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM (SELECT m.id FROM models m JOIN model_categories mc ON mc.model_id = m.id \
         JOIN categories c ON c.id = mc.category_id WHERE m.is_guessable = 1 AND m.status = 'active' \
         AND c.slug = ? ORDER BY m.id LIMIT ?) candidates WHERE id = ?)",
    )
    .bind(category.catalog_slug().expect("focused category has a slug"))
    .bind(fallback_count)
    .bind(model_id)
    .fetch_one(&mut *connection)
    .await?
        != 0)
}

async fn load_model(
    connection: &mut SqliteConnection,
    model_id: &str,
    must_be_eligible: bool,
) -> AppResult<Option<LoadedModel>> {
    let query = if must_be_eligible {
        "SELECT m.id, m.name, p.name AS provider, COALESCE(g.country, p.country_code) AS country, f.name AS family, m.family_tokens_json, \
         m.reasoning_support, g.weight_availability, m.release_date, m.release_year, m.context_window_tokens, g.category_details_json \
         FROM models m JOIN providers p ON p.id = m.provider_id LEFT JOIN model_families f ON f.id = m.family_id \
         LEFT JOIN model_game_metadata g ON g.model_id = m.id \
         WHERE m.id = ? AND m.is_guessable = 1 AND m.status = 'active'"
    } else {
        "SELECT m.id, m.name, p.name AS provider, COALESCE(g.country, p.country_code) AS country, f.name AS family, m.family_tokens_json, \
         m.reasoning_support, g.weight_availability, m.release_date, m.release_year, m.context_window_tokens, g.category_details_json \
         FROM models m JOIN providers p ON p.id = m.provider_id LEFT JOIN model_families f ON f.id = m.family_id \
         LEFT JOIN model_game_metadata g ON g.model_id = m.id \
         WHERE m.id = ?"
    };
    let Some(row) = sqlx::query_as::<_, ModelRow>(query)
        .bind(model_id)
        .fetch_optional(&mut *connection)
        .await?
    else {
        return Ok(None);
    };
    let comparable = ComparableModel {
        id: row.id.clone(),
        provider: row.provider.clone(),
        country: row.country.clone(),
        family: stored_family_values(row.family_tokens_json.as_deref(), row.family.as_deref())?,
        categories: related_names(
            connection,
            "model_categories",
            "category_id",
            "categories",
            &row.id,
        )
        .await?,
        input_modalities: related_names(
            connection,
            "model_input_modalities",
            "modality_id",
            "modalities",
            &row.id,
        )
        .await?,
        output_modalities: related_names(
            connection,
            "model_output_modalities",
            "modality_id",
            "modalities",
            &row.id,
        )
        .await?,
        use_cases: related_names(
            connection,
            "model_use_cases",
            "use_case_id",
            "use_cases",
            &row.id,
        )
        .await?,
        reasoning_support: Some(row.reasoning_support),
        weight_availability: row.weight_availability,
        release_date: row.release_date,
        context_window_tokens: row.context_window_tokens,
        category_details: row
            .category_details_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?
            .unwrap_or_default(),
    };
    Ok(Some(LoadedModel {
        public: GuessedModel {
            id: row.id.clone(),
            name: row.name,
            provider: row.provider,
            country: row.country,
            family: comparable.family.clone(),
            categories: comparable.categories.clone(),
            input_modalities: comparable.input_modalities.clone(),
            output_modalities: comparable.output_modalities.clone(),
            use_cases: comparable.use_cases.clone(),
            reasoning_support: comparable.reasoning_support.clone(),
            weight_availability: comparable.weight_availability.clone(),
            category_details: comparable.category_details.clone(),
            release_year: row.release_year,
            release_date: comparable.release_date.clone(),
            context_window_tokens: comparable.context_window_tokens,
        },
        comparable,
    }))
}

async fn related_names(
    connection: &mut SqliteConnection,
    relation: &str,
    relation_column: &str,
    dictionary: &str,
    model_id: &str,
) -> AppResult<Vec<String>> {
    let query = match (relation, relation_column, dictionary) {
        ("model_categories", "category_id", "categories") => {
            "SELECT d.name FROM model_categories r JOIN categories d ON d.id = r.category_id WHERE r.model_id = ? ORDER BY d.name"
        }
        ("model_input_modalities", "modality_id", "modalities") => {
            "SELECT d.name FROM model_input_modalities r JOIN modalities d ON d.id = r.modality_id WHERE r.model_id = ? ORDER BY d.name"
        }
        ("model_output_modalities", "modality_id", "modalities") => {
            "SELECT d.name FROM model_output_modalities r JOIN modalities d ON d.id = r.modality_id WHERE r.model_id = ? ORDER BY d.name"
        }
        ("model_use_cases", "use_case_id", "use_cases") => {
            "SELECT d.name FROM model_use_cases r JOIN use_cases d ON d.id = r.use_case_id WHERE r.model_id = ? ORDER BY d.name"
        }
        _ => return Err(AppError::config("invalid model relationship query")),
    };
    Ok(sqlx::query_scalar(query)
        .bind(model_id)
        .fetch_all(&mut *connection)
        .await?)
}

async fn find_guess_by_request_id(
    connection: &mut SqliteConnection,
    request_id: Uuid,
) -> AppResult<Option<StoredGuessRow>> {
    Ok(sqlx::query_as::<_, StoredGuessRow>(
        "SELECT challenge_id, player_id, guessed_model_id, attempt_number, is_correct, comparison_json \
         FROM guess_events WHERE request_id = ?",
    )
    .bind(request_id.to_string())
    .fetch_optional(&mut *connection)
    .await?)
}

async fn replay_guess(
    connection: &mut SqliteConnection,
    stored: StoredGuessRow,
    input: &GuessInput,
) -> AppResult<GuessOutcome> {
    if stored.challenge_id != input.challenge_id.to_string()
        || stored.player_id != input.player_id.to_string()
        || stored.guessed_model_id != input.guessed_model_id
        || stored.attempt_number != i64::from(input.attempt_number)
    {
        return Err(AppError::Conflict("REQUEST_ID_REUSED".to_owned()));
    }
    replay_stored_guess(connection, stored, input.challenge_id, input.player_id).await
}

async fn replay_stored_guess(
    connection: &mut SqliteConnection,
    stored: StoredGuessRow,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<GuessOutcome> {
    let guessed = load_model(connection, &stored.guessed_model_id, false)
        .await?
        .ok_or_else(|| AppError::Unavailable("Stored guessed model is unavailable.".to_owned()))?;
    let challenge = find_challenge(&mut *connection, challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Challenge not found.".to_owned()))?;
    let answer = load_model(connection, &challenge.answer_model_id, false)
        .await?
        .ok_or_else(|| AppError::Unavailable("Challenge answer is unavailable.".to_owned()))?;
    let matching = matching_values(&guessed.comparable, &answer.comparable);
    let stats = load_player_stats(connection, player_id, &challenge.mode)
        .await?
        .ok_or_else(|| {
            AppError::Unavailable("Stored player statistics are unavailable.".to_owned())
        })?;
    Ok(GuessOutcome {
        guessed_model: guessed.public,
        comparison: serde_json::from_str(&stored.comparison_json)?,
        matching,
        is_correct: stored.is_correct != 0,
        attempt_number: stored.attempt_number as u16,
        player_stats: player_stats_dto(stats)?,
        completion_count: completion_count(connection, &challenge_id.to_string()).await?,
    })
}

async fn update_player_stats(
    connection: &mut SqliteConnection,
    event_table: PlayerEventTable,
    player_id: Uuid,
    challenge: &ChallengeRecord,
    attempt_number: u16,
    is_correct: bool,
    now: i64,
) -> AppResult<PlayerModeStats> {
    let previous = load_player_stats(connection, player_id, &challenge.mode).await?;
    let is_first_guess = sqlx::query_scalar::<_, i64>(event_table.count_query())
        .bind(&challenge.id)
        .bind(player_id.to_string())
        .fetch_one(&mut *connection)
        .await?
        == 1;
    let previous = previous.unwrap_or_else(|| PlayerStatsRow {
        mode: challenge.mode.clone(),
        current_streak: 0,
        best_streak: 0,
        games_played: 0,
        games_won: 0,
        last_played_date: None,
        last_solved_date: None,
        guess_distribution_json: "{}".to_owned(),
    });
    let mut distribution =
        serde_json::from_str::<BTreeMap<String, i64>>(&previous.guess_distribution_json)?;
    let mut current_streak = previous.current_streak;
    let mut best_streak = previous.best_streak;
    let mut last_solved_date = previous.last_solved_date.clone();
    if is_correct {
        let challenge_date = parse_date(&challenge.challenge_date)?;
        let streak = update_streak(
            &PlayerStreak {
                current_streak,
                best_streak,
                last_solved_date: previous
                    .last_solved_date
                    .as_deref()
                    .map(parse_date)
                    .transpose()?,
            },
            challenge_date,
        );
        current_streak = streak.current_streak;
        best_streak = streak.best_streak;
        last_solved_date = streak.last_solved_date.map(format_date).transpose()?;
        *distribution.entry(attempt_number.to_string()).or_default() += 1;
    }
    let last_played_date = match &previous.last_played_date {
        Some(previous_date) if previous_date > &challenge.challenge_date => {
            Some(previous_date.clone())
        }
        _ => Some(challenge.challenge_date.clone()),
    };
    let stats = PlayerStatsRow {
        mode: challenge.mode.clone(),
        current_streak,
        best_streak,
        games_played: previous.games_played + i64::from(u8::from(is_first_guess)),
        games_won: previous.games_won + i64::from(u8::from(is_correct)),
        last_played_date,
        last_solved_date,
        guess_distribution_json: serde_json::to_string(&distribution)?,
    };
    sqlx::query(
        "INSERT INTO player_mode_stats \
         (player_id, mode, current_streak, best_streak, games_played, games_won, last_played_date, last_solved_date, guess_distribution_json, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(player_id, mode) DO UPDATE SET current_streak = excluded.current_streak, \
         best_streak = excluded.best_streak, games_played = excluded.games_played, games_won = excluded.games_won, \
         last_played_date = excluded.last_played_date, last_solved_date = excluded.last_solved_date, \
         guess_distribution_json = excluded.guess_distribution_json, updated_at = excluded.updated_at",
    )
    .bind(player_id.to_string())
    .bind(&stats.mode)
    .bind(stats.current_streak)
    .bind(stats.best_streak)
    .bind(stats.games_played)
    .bind(stats.games_won)
    .bind(&stats.last_played_date)
    .bind(&stats.last_solved_date)
    .bind(&stats.guess_distribution_json)
    .bind(now)
    .execute(&mut *connection)
    .await?;
    player_stats_dto(stats)
}

async fn load_player_stats(
    connection: &mut SqliteConnection,
    player_id: Uuid,
    mode: &str,
) -> AppResult<Option<PlayerStatsRow>> {
    Ok(sqlx::query_as::<_, PlayerStatsRow>(
        "SELECT mode, current_streak, best_streak, games_played, games_won, last_played_date, \
         last_solved_date, guess_distribution_json FROM player_mode_stats WHERE player_id = ? AND mode = ?",
    )
    .bind(player_id.to_string())
    .bind(mode)
    .fetch_optional(&mut *connection)
    .await?)
}

fn player_stats_dto(row: PlayerStatsRow) -> AppResult<PlayerModeStats> {
    Ok(PlayerModeStats {
        mode: row.mode,
        current_streak: row.current_streak,
        best_streak: row.best_streak,
        games_played: row.games_played,
        games_won: row.games_won,
        last_played_date: row.last_played_date,
        last_solved_date: row.last_solved_date,
        guess_distribution: serde_json::from_str(&row.guess_distribution_json)?,
    })
}

#[derive(FromRow)]
struct RecentAnswerRow {
    model_id: String,
    challenge_date: String,
}

struct LoadedModel {
    public: GuessedModel,
    comparable: ComparableModel,
}

fn split_aliases(aliases: String) -> Vec<String> {
    if aliases.is_empty() {
        Vec::new()
    } else {
        aliases.split('\u{1f}').map(ToOwned::to_owned).collect()
    }
}

fn stored_family_values(json: Option<&str>, primary: Option<&str>) -> AppResult<Vec<String>> {
    if let Some(json) = json {
        let values: Vec<String> = serde_json::from_str(json)?;
        if !values.is_empty() {
            return Ok(values);
        }
    }
    Ok(primary.into_iter().map(ToOwned::to_owned).collect())
}

fn now_unix_millis() -> i64 {
    OffsetDateTime::now_utc()
        .unix_timestamp_nanos()
        .div_euclid(1_000_000) as i64
}

fn parse_date(value: &str) -> AppResult<Date> {
    Date::parse(value, &DATE_FORMAT)
        .map_err(|_| AppError::Unavailable("Stored challenge date is invalid.".to_owned()))
}

fn format_date(date: Date) -> AppResult<String> {
    date.format(&DATE_FORMAT)
        .map_err(|_| AppError::Unavailable("Could not format challenge date.".to_owned()))
}
