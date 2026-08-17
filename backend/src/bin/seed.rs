#![forbid(unsafe_code)]

use std::sync::Arc;

use aidle_api::{config::AppConfig, db, error::AppResult};
use serde::Deserialize;
use sqlx::SqliteConnection;
use time::OffsetDateTime;

const MODELS: &str = include_str!("../../../data/models.seed.json");
const EMOJI_CLUES: &str = include_str!("../../../data/emoji.seed.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedModel {
    id: String,
    name: String,
    min_pool: Option<i64>,
    provider: Option<String>,
    country: Option<String>,
    family: Option<String>,
    categories: Vec<String>,
    input_modalities: Option<Vec<String>>,
    output_modalities: Option<Vec<String>>,
    use_cases: Option<Vec<String>>,
    reasoning_support: Option<String>,
    weight_availability: Option<String>,
    release_date: Option<String>,
    context_window_tokens: Option<i64>,
    aliases: Option<Vec<String>>,
    #[serde(default)]
    category_details: serde_json::Value,
}

#[tokio::main]
async fn main() -> AppResult<()> {
    dotenvy::dotenv().ok();
    let config = Arc::new(AppConfig::from_env()?);
    let pool = db::connect(&config).await?;
    db::migrate(&pool).await?;
    let models: Vec<SeedModel> = serde_json::from_str(MODELS)?;
    let now = OffsetDateTime::now_utc()
        .unix_timestamp_nanos()
        .div_euclid(1_000_000) as i64;
    let mut transaction = pool.begin().await?;
    for model in &models {
        seed_model(&mut transaction, model, now).await?;
    }
    let visual_clues: Vec<aidle_api::domain::visual_clues::VisualClueEntity> =
        serde_json::from_str(EMOJI_CLUES)?;
    for entity in visual_clues {
        sqlx::query(
            "INSERT INTO visual_clue_entities \
             (id, name, aliases_json, entity_kind, categories_json, min_pool, entity_json, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, aliases_json = excluded.aliases_json, \
             entity_kind = excluded.entity_kind, categories_json = excluded.categories_json, \
             min_pool = excluded.min_pool, entity_json = excluded.entity_json, updated_at = excluded.updated_at",
        )
        .bind(&entity.id)
        .bind(&entity.name)
        .bind(serde_json::to_string(&entity.aliases)?)
        .bind(match &entity.entity_kind {
            aidle_api::domain::visual_clues::EntityKind::Emoji => "emoji",
            aidle_api::domain::visual_clues::EntityKind::Architecture => "architecture",
            aidle_api::domain::visual_clues::EntityKind::Algorithm => "algorithm",
            aidle_api::domain::visual_clues::EntityKind::Operator => "operator",
        })
        .bind(serde_json::to_string(&entity.categories)?)
        .bind(i64::from(entity.min_pool))
        .bind(serde_json::to_string(&entity)?)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    println!("Seeded {} models.", models.len());
    Ok(())
}

async fn seed_model(
    connection: &mut SqliteConnection,
    model: &SeedModel,
    now: i64,
) -> AppResult<()> {
    let provider_name = model.provider.as_deref().unwrap_or("Unknown");
    let provider_id = slug(provider_name);
    let family_id = model
        .family
        .as_ref()
        .map(|family| format!("{provider_id}-{}", slug(family)));
    sqlx::query(
        "INSERT INTO providers (id, name, slug, country_code, is_active, created_at, updated_at) \
         VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, \
         country_code = excluded.country_code, updated_at = excluded.updated_at",
    )
    .bind(&provider_id)
    .bind(provider_name)
    .bind(&provider_id)
    .bind(country_code(model.country.as_deref()))
    .bind(now)
    .bind(now)
    .execute(&mut *connection)
    .await?;
    if let (Some(family), Some(family_id)) = (&model.family, &family_id) {
        sqlx::query(
            "INSERT INTO model_families (id, provider_id, name, slug, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(family_id)
        .bind(&provider_id)
        .bind(family)
        .bind(slug(family))
        .bind(now)
        .bind(now)
        .execute(&mut *connection)
        .await?;
    }
    let release_year = model
        .release_date
        .as_deref()
        .and_then(|date| date.get(..4))
        .and_then(|year| year.parse::<i64>().ok());
    sqlx::query(
        "INSERT INTO models (id, provider_id, family_id, name, slug, release_date, release_year, context_window_tokens, \
         open_weights, local_execution, reasoning_support, status, is_guessable, verified_at, source_label, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', ?, 'active', 1, 'seeded', 'Seed data', ?, ?) \
         ON CONFLICT(id) DO UPDATE SET provider_id = excluded.provider_id, family_id = excluded.family_id, \
         name = excluded.name, release_date = excluded.release_date, release_year = excluded.release_year, \
         context_window_tokens = excluded.context_window_tokens, open_weights = excluded.open_weights, \
         reasoning_support = excluded.reasoning_support, updated_at = excluded.updated_at",
    )
    .bind(&model.id)
    .bind(&provider_id)
    .bind(family_id)
    .bind(&model.name)
    .bind(&model.id)
    .bind(&model.release_date)
    .bind(release_year)
    .bind(model.context_window_tokens)
    .bind(model.weight_availability.as_deref().map(|value| i64::from(u8::from(value == "open"))))
    .bind(model.reasoning_support.as_deref().unwrap_or("unknown"))
    .bind(now)
    .bind(now)
    .execute(&mut *connection)
    .await?;
    sqlx::query(
        "INSERT INTO model_game_metadata \
         (model_id, min_pool_rank, country, weight_availability, category_details_json, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?) \
         ON CONFLICT(model_id) DO UPDATE SET min_pool_rank = excluded.min_pool_rank, \
         country = excluded.country, weight_availability = excluded.weight_availability, \
         category_details_json = excluded.category_details_json, updated_at = excluded.updated_at",
    )
    .bind(&model.id)
    .bind(model.min_pool.unwrap_or(0).clamp(0, 2))
    .bind(&model.country)
    .bind(&model.weight_availability)
    .bind(serde_json::to_string(&model.category_details)?)
    .bind(now)
    .execute(&mut *connection)
    .await?;
    for alias in model.aliases.as_deref().unwrap_or_default() {
        let normalized = slug(alias);
        sqlx::query(
            "INSERT INTO model_aliases (id, model_id, alias, normalized_alias) VALUES (?, ?, ?, ?) \
             ON CONFLICT(model_id, normalized_alias) DO NOTHING",
        )
        .bind(format!("{}-{normalized}", model.id))
        .bind(&model.id)
        .bind(alias)
        .bind(normalized)
        .execute(&mut *connection)
        .await?;
    }
    seed_relationships(
        connection,
        "categories",
        "model_categories",
        "category_id",
        &model.id,
        &model.categories,
    )
    .await?;
    seed_relationships(
        connection,
        "modalities",
        "model_input_modalities",
        "modality_id",
        &model.id,
        model.input_modalities.as_deref().unwrap_or_default(),
    )
    .await?;
    seed_relationships(
        connection,
        "modalities",
        "model_output_modalities",
        "modality_id",
        &model.id,
        model.output_modalities.as_deref().unwrap_or_default(),
    )
    .await?;
    seed_relationships(
        connection,
        "use_cases",
        "model_use_cases",
        "use_case_id",
        &model.id,
        model.use_cases.as_deref().unwrap_or_default(),
    )
    .await
}

async fn seed_relationships(
    connection: &mut SqliteConnection,
    dictionary: &str,
    relation: &str,
    relation_column: &str,
    model_id: &str,
    values: &[String],
) -> AppResult<()> {
    let (dictionary_query, relation_query) = match (dictionary, relation, relation_column) {
        ("categories", "model_categories", "category_id") => (
            "INSERT INTO categories (id, name, slug) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
            "INSERT INTO model_categories (model_id, category_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
        ),
        ("modalities", "model_input_modalities", "modality_id") => (
            "INSERT INTO modalities (id, name, slug) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
            "INSERT INTO model_input_modalities (model_id, modality_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
        ),
        ("modalities", "model_output_modalities", "modality_id") => (
            "INSERT INTO modalities (id, name, slug) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
            "INSERT INTO model_output_modalities (model_id, modality_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
        ),
        ("use_cases", "model_use_cases", "use_case_id") => (
            "INSERT INTO use_cases (id, name, slug) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
            "INSERT INTO model_use_cases (model_id, use_case_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
        ),
        _ => {
            return Err(aidle_api::error::AppError::config(
                "invalid seed relationship",
            ));
        }
    };
    for value in values {
        let id = slug(value);
        sqlx::query(dictionary_query)
            .bind(&id)
            .bind(value.replace('-', " "))
            .bind(&id)
            .execute(&mut *connection)
            .await?;
        sqlx::query(relation_query)
            .bind(model_id)
            .bind(id)
            .execute(&mut *connection)
            .await?;
    }
    Ok(())
}

fn slug(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut previous_dash = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            output.push(character);
            previous_dash = false;
        } else if !output.is_empty() && !previous_dash {
            output.push('-');
            previous_dash = true;
        }
    }
    output.trim_end_matches('-').to_owned()
}

fn country_code(country: Option<&str>) -> &'static str {
    match country {
        Some("United States") => "US",
        Some("Canada") => "CA",
        Some("China") => "CN",
        Some("France") => "FR",
        Some("Poland") => "PL",
        _ => "UN",
    }
}
