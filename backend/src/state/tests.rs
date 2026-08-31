use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::Arc,
    time::Duration,
};

use sqlx::sqlite::SqlitePoolOptions;

use super::*;
use crate::config::{AppConfig, AppEnvironment};

fn config() -> Arc<AppConfig> {
    Arc::new(AppConfig {
        environment: AppEnvironment::Local,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        database_url: "sqlite::memory:".to_owned(),
        daily_selection_secret: "daily-selection-secret-1234567890".to_owned(),
        request_timeout: Duration::from_secs(1),
        app_origin: "http://localhost:5173".to_owned(),
        secure_cookies: false,
        auth_secret: "authentication-secret-123456789012".to_owned(),
        health_key: "health-check-secret-1234567890123".to_owned(),
        release_version: "test".to_owned(),
        github_oauth: None,
        github_issues_token: None,
        google_oauth: None,
        resend_api_key: None,
    })
}

#[tokio::test]
async fn new_builds_cloneable_state_with_catalog_and_http_defaults() {
    let db = SqlitePoolOptions::new()
        .connect_lazy("sqlite::memory:")
        .expect("pool");
    let config = config();
    let state = AppState::new(db.clone(), config.clone()).expect("application state");
    let cloned = state.clone();

    assert!(Arc::ptr_eq(&state.config, &config));
    assert!(Arc::ptr_eq(&state.emoji, &cloned.emoji));
    assert!(state.emoji.eligible(u8::MAX).next().is_some());
    assert_eq!(
        state.db.options().get_max_connections(),
        db.options().get_max_connections()
    );
}

#[test]
fn invalid_http_user_agent_is_reported_as_configuration_error() {
    let error = build_http_client(Duration::from_secs(1), "invalid\nuser-agent")
        .expect_err("invalid user agent should fail");

    assert!(matches!(error, AppError::Config(_)));
    assert!(
        error
            .to_string()
            .contains("failed to create outbound HTTP client")
    );
}

#[tokio::test]
async fn configured_http_client_sends_the_application_user_agent() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
    let address = listener.local_addr().expect("listener address");
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("connection");
        let mut request = vec![0_u8; 2048];
        let read = stream.read(&mut request).expect("request");
        stream
            .write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n")
            .expect("response");
        String::from_utf8(request[..read].to_vec()).expect("HTTP request")
    });
    let db = SqlitePoolOptions::new()
        .connect_lazy("sqlite::memory:")
        .expect("pool");
    let state = AppState::new(db, config()).expect("application state");

    let response = state
        .http
        .get(format!("http://{address}/"))
        .send()
        .await
        .expect("HTTP response");
    let request = server.join().expect("server thread");

    assert_eq!(response.status(), reqwest::StatusCode::NO_CONTENT);
    assert!(
        request
            .to_ascii_lowercase()
            .contains("user-agent: aaidle/1.0")
    );
}
