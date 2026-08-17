use std::{env, net::SocketAddr, str::FromStr, time::Duration};

use crate::error::{AppError, AppResult};

pub const DB_MAX_CONNECTIONS: u32 = 4;
pub const DAILY_ANSWER_COOLDOWN_DAYS: i64 = 60;
const LOCAL_APP_ORIGIN: &str = "http://localhost:5173";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppEnvironment {
    Local,
    Production,
}

impl AppEnvironment {
    fn from_env() -> Self {
        if matches!(env::var("AIDLE_ENV").as_deref(), Ok("production"))
            || matches!(env::var("NODE_ENV").as_deref(), Ok("production"))
        {
            Self::Production
        } else {
            Self::Local
        }
    }

    fn is_production(self) -> bool {
        matches!(self, Self::Production)
    }
}

#[derive(Debug)]
pub struct OAuthClientConfig {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Debug)]
pub struct AppConfig {
    pub environment: AppEnvironment,
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub daily_selection_secret: String,
    pub request_timeout: Duration,
    pub app_origin: String,
    pub secure_cookies: bool,
    pub auth_secret: String,
    pub health_key: String,
    pub release_version: String,
    pub github_oauth: Option<OAuthClientConfig>,
    pub github_issues_token: Option<String>,
    pub google_oauth: Option<OAuthClientConfig>,
    pub resend_api_key: Option<String>,
}

impl AppConfig {
    pub fn from_env() -> AppResult<Self> {
        let bind_addr = env_or("AIDLE_BIND_ADDR", "0.0.0.0:8080")
            .parse()
            .map_err(|_| AppError::config("AIDLE_BIND_ADDR must be a socket address"))?;
        let database_url = env_or("DATABASE_URL", "sqlite://../data/aidle.db");
        let request_timeout_seconds = parse_env("REQUEST_TIMEOUT_SECONDS", 10_u64)?;
        if !(1..=120).contains(&request_timeout_seconds) {
            return Err(AppError::config(
                "REQUEST_TIMEOUT_SECONDS must be between 1 and 120",
            ));
        }

        let environment = AppEnvironment::from_env();
        let is_production = environment.is_production();
        let daily_selection_secret = match env::var("DAILY_SELECTION_SECRET") {
            Ok(secret) if secret.len() >= 32 => secret,
            Ok(_) => {
                return Err(AppError::config(
                    "DAILY_SELECTION_SECRET must be at least 32 bytes",
                ));
            }
            Err(_) if is_production => {
                return Err(AppError::config(
                    "DAILY_SELECTION_SECRET is required in production",
                ));
            }
            Err(_) => "development-only-secret-do-not-use-in-production".to_owned(),
        };
        let app_origin = match env::var("APP_ORIGIN") {
            Ok(origin) if !origin.trim().is_empty() => origin.trim_end_matches('/').to_owned(),
            _ if is_production => {
                return Err(AppError::config("APP_ORIGIN is required in production"));
            }
            _ => LOCAL_APP_ORIGIN.to_owned(),
        };
        let auth_secret = required_secret(
            "AUTH_SECRET",
            is_production,
            "local-development-auth-secret-not-for-production",
        )?;
        let health_key = required_secret(
            "HEALTH_KEY",
            is_production,
            "local-development-health-key-not-for-production",
        )?;
        let release_version = match env::var("AAIDLE_VERSION") {
            Ok(version) if !version.trim().is_empty() => version,
            _ if is_production => {
                return Err(AppError::config("AAIDLE_VERSION is required in production"));
            }
            _ => env!("CARGO_PKG_VERSION").to_owned(),
        };

        Ok(Self {
            environment,
            bind_addr,
            database_url,
            daily_selection_secret,
            request_timeout: Duration::from_secs(request_timeout_seconds),
            app_origin,
            secure_cookies: is_production,
            auth_secret,
            health_key,
            release_version,
            github_oauth: oauth_config("GITHUB")?,
            github_issues_token: env::var("GITHUB_ISSUES_TOKEN")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            google_oauth: oauth_config("GOOGLE")?,
            resend_api_key: env::var("RESEND_API_KEY")
                .ok()
                .filter(|value| !value.trim().is_empty()),
        })
    }
}

fn required_secret(key: &str, is_production: bool, development_default: &str) -> AppResult<String> {
    match env::var(key) {
        Ok(secret) if secret.len() >= 32 => Ok(secret),
        Ok(_) => Err(AppError::config(format!("{key} must be at least 32 bytes"))),
        Err(_) if is_production => {
            Err(AppError::config(format!("{key} is required in production")))
        }
        Err(_) => Ok(development_default.to_owned()),
    }
}

fn oauth_config(prefix: &str) -> AppResult<Option<OAuthClientConfig>> {
    let client_id = env::var(format!("{prefix}_CLIENT_ID"))
        .ok()
        .filter(|value| !value.trim().is_empty());
    let client_secret = env::var(format!("{prefix}_CLIENT_SECRET"))
        .ok()
        .filter(|value| !value.trim().is_empty());
    match (client_id, client_secret) {
        (None, None) => Ok(None),
        (Some(client_id), Some(client_secret)) => Ok(Some(OAuthClientConfig {
            client_id,
            client_secret,
        })),
        _ => Err(AppError::config(format!(
            "{prefix}_CLIENT_ID and {prefix}_CLIENT_SECRET must be configured together"
        ))),
    }
}

fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn parse_env<T>(key: &str, default: T) -> AppResult<T>
where
    T: FromStr,
{
    match env::var(key) {
        Ok(value) => value
            .parse()
            .map_err(|_| AppError::config(format!("{key} has an invalid value"))),
        Err(_) => Ok(default),
    }
}
