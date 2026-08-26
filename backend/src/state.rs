use std::sync::Arc;

use reqwest::Client;
use sqlx::SqlitePool;

use crate::{
    config::AppConfig,
    domain::emoji::VisualClueCatalog,
    error::{AppError, AppResult},
};

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: Arc<AppConfig>,
    pub http: Client,
    pub emoji: Arc<VisualClueCatalog>,
}

impl AppState {
    pub fn new(db: SqlitePool, config: Arc<AppConfig>) -> AppResult<Self> {
        let http = Client::builder()
            .timeout(config.request_timeout)
            .user_agent("aAIdle/1.0")
            .build()
            .map_err(|error| {
                AppError::config(format!("failed to create outbound HTTP client: {error}"))
            })?;
        Ok(Self {
            db,
            config,
            http,
            emoji: Arc::new(VisualClueCatalog::load()?),
        })
    }
}
