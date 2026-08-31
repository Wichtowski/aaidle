#![forbid(unsafe_code)]

use std::{future::Future, net::SocketAddr, sync::Arc};

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
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new("info")))
        .compact()
        .init();

    let config = Arc::new(AppConfig::from_env()?);
    run(config, migrate_only(std::env::args()), shutdown_signal()).await
}

async fn run(
    config: Arc<AppConfig>,
    migrate_only: bool,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> AppResult<()> {
    let pool = db::connect(&config).await?;
    if migrate_only {
        let version = db::migrate(&pool).await?;
        info!("database migrations completed to version {version}");
        return Ok(());
    }
    db::migrate(&pool).await?;
    serve(config, pool, shutdown).await
}

async fn serve(
    config: Arc<AppConfig>,
    pool: sqlx::SqlitePool,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> AppResult<()> {
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
    .with_graceful_shutdown(shutdown)
    .await
    .map_err(|error| AppError::config(format!("HTTP server failed: {error}")));
    rate_limit_maintenance.abort();
    result
}

fn migrate_only(args: impl IntoIterator<Item = String>) -> bool {
    args.into_iter().nth(1).as_deref() == Some("migrate")
}

fn rate_limit_retention_cutoff(now_millis: i128) -> i64 {
    const RETENTION_MILLIS: i64 = 24 * 60 * 60 * 1_000;
    i64::try_from(now_millis)
        .unwrap_or(i64::MAX)
        .saturating_sub(RETENTION_MILLIS)
}

async fn purge_expired_rate_limits(pool: sqlx::SqlitePool) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60 * 60));
    loop {
        interval.tick().await;
        let now = time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000;
        let before = rate_limit_retention_cutoff(now);
        purge_expired_rate_limits_once(&pool, before).await;
    }
}

async fn purge_expired_rate_limits_once(pool: &sqlx::SqlitePool, before: i64) {
    match aidle_api::auth::purge_expired_rate_limits(pool, before).await {
        Ok(removed) if removed > 0 => info!(removed, "purged expired rate limits"),
        Ok(_) => {}
        Err(error) => warn!(%error, "failed to purge expired rate limits"),
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ShutdownCause {
    CtrlC,
    Terminate,
}

async fn select_shutdown(
    ctrl_c: impl Future<Output = std::io::Result<()>>,
    terminate: impl Future<Output = Option<()>>,
) -> ShutdownCause {
    tokio::select! {
        result = ctrl_c => {
            result.expect("failed to install Ctrl+C handler");
            ShutdownCause::CtrlC
        },
        _ = terminate => ShutdownCause::Terminate,
    }
}

fn log_shutdown(cause: ShutdownCause) {
    match cause {
        ShutdownCause::CtrlC => warn!("received Ctrl+C, shutting down"),
        ShutdownCause::Terminate => warn!("received SIGTERM, shutting down"),
    }
}

async fn shutdown_signal() {
    #[cfg(unix)]
    let mut terminate = signal::unix::signal(signal::unix::SignalKind::terminate())
        .expect("failed to install SIGTERM handler");
    #[cfg(unix)]
    let terminate = terminate.recv();
    #[cfg(not(unix))]
    let terminate = std::future::pending::<Option<()>>();

    log_shutdown(select_shutdown(signal::ctrl_c(), terminate).await);
}

#[cfg(test)]
mod tests;
