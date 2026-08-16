#![forbid(unsafe_code)]

use std::sync::Arc;

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
        db::migrate(&pool).await?;
        info!("database migrations completed");
        return Ok(());
    }
    db::migrate(&pool).await?;

    let listener = tokio::net::TcpListener::bind(config.bind_addr)
        .await
        .map_err(|error| AppError::config(format!("failed to bind AIDLE_BIND_ADDR: {error}")))?;
    info!(address = %config.bind_addr, "aidle API listening");
    axum::serve(listener, api::router(AppState::new(pool, config)?))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|error| AppError::config(format!("HTTP server failed: {error}")))
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
