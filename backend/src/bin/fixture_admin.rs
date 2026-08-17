#![forbid(unsafe_code)]

use std::sync::Arc;

use aidle_api::{auth, config::AppConfig, db, error::AppResult};
use time::OffsetDateTime;
use uuid::Uuid;

const EMAIL: &str = "admin@test.com";
const PASSWORD: &str = "zaq1@WSX";

#[tokio::main]
async fn main() -> AppResult<()> {
    dotenvy::dotenv().ok();
    let config = Arc::new(AppConfig::from_env()?);
    let pool = db::connect(&config).await?;
    db::migrate(&pool).await?;

    let email = auth::normalize_email(EMAIL)?;
    let password_hash = auth::hash_password(PASSWORD)?;
    let now = OffsetDateTime::now_utc()
        .unix_timestamp_nanos()
        .div_euclid(1_000_000) as i64;

    sqlx::query(
        "INSERT INTO users \
         (id, email, email_normalized, password_hash, email_verified_at, permission, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, 'superadmin', ?, ?) \
         ON CONFLICT(email_normalized) DO UPDATE SET \
         email = excluded.email, password_hash = excluded.password_hash, \
         email_verified_at = excluded.email_verified_at, permission = excluded.permission, \
         disabled_at = NULL, disabled_reason = NULL, disabled_by_user_id = NULL, \
         updated_at = excluded.updated_at",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&email)
    .bind(&email)
    .bind(password_hash)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    println!("Provisioned development superadmin {EMAIL}.");
    Ok(())
}
