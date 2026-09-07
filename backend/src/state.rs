use std::{sync::Arc, time::Duration};

use reqwest::Client;
use sqlx::SqlitePool;

use crate::{
    config::AppConfig,
    domain::{emoji::VisualClueCatalog, logo::LogoCatalog},
    error::{AppError, AppResult},
    logo_images::LogoImageCache,
};

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: Arc<AppConfig>,
    pub http: Client,
    pub emoji: Arc<VisualClueCatalog>,
    pub logo: Arc<LogoCatalog>,
    pub logo_images: Arc<LogoImageCache>,
}

fn build_http_client(timeout: Duration, user_agent: &str) -> AppResult<Client> {
    Client::builder()
        .timeout(timeout)
        .user_agent(user_agent)
        .build()
        .map_err(|error| {
            AppError::config(format!("failed to create outbound HTTP client: {error}"))
        })
}

impl AppState {
    pub fn new(db: SqlitePool, config: Arc<AppConfig>) -> AppResult<Self> {
        let http = build_http_client(config.request_timeout, "aAIdle/1.0")?;
        let logo_images = Arc::new(LogoImageCache::new(
            &config.app_origin,
            config.request_timeout,
        )?);
        Ok(Self {
            db,
            config,
            http,
            emoji: Arc::new(VisualClueCatalog::load()?),
            logo: Arc::new(LogoCatalog::load()?),
            logo_images,
        })
    }
}

#[cfg(test)]
mod tests;
