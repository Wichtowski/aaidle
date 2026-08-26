#![forbid(unsafe_code)]

use std::{net::SocketAddr, sync::Arc};

use aidle_api::{
    api,
    config::AppConfig,
    db,
    error::{AppError, AppResult},
    state::AppState,
};
use tokio::signal;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> AppResult<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .compact()
        .init();

    let config = Arc::new(AppConfig::from_env()?);
    let pool = db::connect(&config).await?;
    if std::env::args().nth(1).as_deref() == Some("migrate") {
        let version = db::migrate(&pool).await?;
        info!("database migrations completed to version {version}");
        return Ok(());
    }
    db::migrate(&pool).await?;

    let listener = tokio::net::TcpListener::bind(config.bind_addr)
        .await
        .map_err(|error| AppError::config(format!("failed to bind AIDLE_BIND_ADDR: {error}")))?;
    let rate_limit_maintenance = tokio::spawn(purge_expired_rate_limits(pool.clone()));
    info!(address = %config.bind_addr, "aidle API listening");
    let result = axum::serve(
        listener,
        api::router(AppState::new(pool, config)?)
            .into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .map_err(|error| AppError::config(format!("HTTP server failed: {error}")));
    rate_limit_maintenance.abort();
    result
}

async fn purge_expired_rate_limits(pool: sqlx::SqlitePool) {
    const RETENTION_MILLIS: i64 = 24 * 60 * 60 * 1_000;
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60 * 60));
    loop {
        interval.tick().await;
        let now = time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000;
        let before = i64::try_from(now)
            .unwrap_or(i64::MAX)
            .saturating_sub(RETENTION_MILLIS);
        match aidle_api::auth::purge_expired_rate_limits(&pool, before).await {
            Ok(removed) if removed > 0 => info!(removed, "purged expired rate limits"),
            Ok(_) => {}
            Err(error) => warn!(%error, "failed to purge expired rate limits"),
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => warn!("received Ctrl+C, shutting down"),
        () = terminate => warn!("received SIGTERM, shutting down"),
    }
}
