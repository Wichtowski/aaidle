use std::{str::FromStr, time::Duration};

use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};

use crate::{
    config::{AppConfig, DB_MAX_CONNECTIONS},
    error::AppResult,
};

pub async fn connect(config: &AppConfig) -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::from_str(&config.database_url)
        .map_err(|_| crate::error::AppError::config("DATABASE_URL must be a valid SQLite URL"))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5));

    Ok(SqlitePoolOptions::new()
        .max_connections(DB_MAX_CONNECTIONS)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options)
        .await?)
}

pub async fn migrate(pool: &SqlitePool) -> AppResult<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(|error| {
            crate::error::AppError::config(format!("database migration failed: {error}"))
        })?;
    Ok(())
}
