use std::{sync::Arc, time::Duration};

use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};

use crate::{
    config::{AppConfig, AppEnvironment},
    state::AppState,
};

pub(super) async fn state() -> AppState {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect test database");
    crate::db::migrate(&pool)
        .await
        .expect("migrate test database");
    state_with_pool(pool)
}

pub(super) fn state_with_pool(pool: SqlitePool) -> AppState {
    let config = Arc::new(AppConfig {
        environment: AppEnvironment::Local,
        bind_addr: "127.0.0.1:0".parse().expect("socket address"),
        database_url: "sqlite::memory:".to_owned(),
        daily_selection_secret: "test secret that is longer than thirty two bytes".to_owned(),
        request_timeout: Duration::from_secs(10),
        app_origin: "http://localhost:3000".to_owned(),
        secure_cookies: false,
        auth_secret: "test secret that is longer than thirty two bytes".to_owned(),
        health_key: "test health key that is longer than thirty two bytes".to_owned(),
        release_version: "v1.2.3".to_owned(),
        github_oauth: None,
        github_issues_token: None,
        google_oauth: None,
        resend_api_key: None,
    });
    AppState::new(pool, config).expect("construct test state")
}
