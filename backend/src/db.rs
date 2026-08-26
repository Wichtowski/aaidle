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

pub async fn migrate(pool: &SqlitePool) -> AppResult<i64> {
    let mut connection = pool.acquire().await?;
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *connection)
        .await?;

    let migration_result = sqlx::migrate!("./migrations").run(&mut *connection).await;
    let foreign_key_result = sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *connection)
        .await;

    migration_result.map_err(|error| {
        crate::error::AppError::config(format!("database migration failed: {error}"))
    })?;
    foreign_key_result?;

    Ok(sqlx::migrate!("./migrations")
        .migrations
        .last()
        .map(|migration| migration.version)
        .unwrap_or(0))
}
