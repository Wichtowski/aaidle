use std::{
    io::{Read, Write},
    net::TcpListener,
    thread::JoinHandle,
    time::Duration,
};

use reqwest::Proxy;

use super::*;
use crate::config::{AppConfig, AppEnvironment};

fn request_complete(request: &[u8]) -> bool {
    let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n") else {
        return false;
    };
    let headers = String::from_utf8_lossy(&request[..header_end]).to_ascii_lowercase();
    let content_length = headers
        .lines()
        .find_map(|line| line.strip_prefix("content-length:"))
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(0);
    request.len() >= header_end + 4 + content_length
}

fn local_server(status: &str) -> (String, JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
    let address = listener.local_addr().expect("listener address");
    let response = format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("connection");
        let mut request = Vec::new();
        while !request_complete(&request) {
            let mut chunk = [0_u8; 2048];
            let read = stream.read(&mut chunk).expect("request");
            if read == 0 {
                break;
            }
            request.extend_from_slice(&chunk[..read]);
        }
        stream.write_all(response.as_bytes()).expect("response");
        String::from_utf8(request).expect("HTTP request")
    });
    (format!("http://{address}/emails"), server)
}

fn config(secure_cookies: bool, resend_api_key: Option<&str>) -> AppConfig {
    AppConfig {
        environment: AppEnvironment::Local,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        database_url: "sqlite::memory:".to_owned(),
        daily_selection_secret: "daily-selection-secret-1234567890".to_owned(),
        request_timeout: Duration::from_millis(100),
        app_origin: "https://aaidle.example".to_owned(),
        secure_cookies,
        auth_secret: "authentication-secret-123456789012".to_owned(),
        health_key: "health-check-secret-1234567890123".to_owned(),
        release_version: "test".to_owned(),
        github_oauth: None,
        github_issues_token: None,
        google_oauth: None,
        resend_api_key: resend_api_key.map(str::to_owned),
    }
}

#[test]
fn purposes_define_distinct_email_content() {
    let cases = [
        (
            AuthEmailPurpose::EmailVerification,
            "/api/v1/auth/email-verification/verify",
            "Activate your aAIdle account",
            "Activate account",
            "30 minutes",
            "",
        ),
        (
            AuthEmailPurpose::PasswordReset,
            "/api/v1/auth/password-reset/verify",
            "Reset your aAIdle password",
            "Reset password",
            "15 minutes",
            "",
        ),
        (
            AuthEmailPurpose::AccountDeletion,
            "/api/v1/auth/account-deletion/verify",
            "Confirm deletion of your aAIdle account",
            "Delete account",
            "5 minutes",
            " This permanently deletes your account and cannot be undone.",
        ),
    ];

    for (purpose, path, subject, action, expiry, warning) in cases {
        assert_eq!(purpose.path(), path);
        assert_eq!(purpose.subject(), subject);
        assert_eq!(purpose.action(), action);
        assert_eq!(purpose.expiry(), expiry);
        assert_eq!(purpose.deletion_warning(), warning);
    }
}

#[test]
fn resend_payload_serializes_all_delivery_fields() {
    let payload = ResendEmail {
        from: SENDER,
        to: vec!["person@example.com"],
        subject: "Subject",
        text: "Plain text".to_owned(),
        html: "<p>HTML</p>".to_owned(),
    };
    let value = serde_json::to_value(payload).expect("serialize payload");

    assert_eq!(value["from"], SENDER);
    assert_eq!(value["to"][0], "person@example.com");
    assert_eq!(value["subject"], "Subject");
    assert_eq!(value["text"], "Plain text");
    assert_eq!(value["html"], "<p>HTML</p>");
}

#[tokio::test]
async fn local_delivery_returns_each_purpose_link_without_network_access() {
    let client = Client::new();
    let config = config(false, None);

    for purpose in [
        AuthEmailPurpose::EmailVerification,
        AuthEmailPurpose::PasswordReset,
        AuthEmailPurpose::AccountDeletion,
    ] {
        let delivery = send_auth_email(&client, &config, "person@example.com", purpose, "a+b")
            .await
            .expect("local delivery");
        assert_eq!(
            delivery.local_url.as_deref(),
            Some(format!("{}{}?token=a+b", config.app_origin, purpose.path()).as_str())
        );
    }
}

#[tokio::test]
async fn production_delivery_requires_an_api_key() {
    let error = send_auth_email(
        &Client::new(),
        &config(true, None),
        "person@example.com",
        AuthEmailPurpose::PasswordReset,
        "token",
    )
    .await
    .err()
    .expect("missing email configuration should fail");

    assert!(matches!(error, AppError::Unavailable(_)));
    assert!(error.to_string().contains("not configured"));
}

#[tokio::test]
async fn successful_delivery_sends_complete_content_and_headers() {
    let (endpoint, server) = local_server("202 Accepted");

    let delivery = send_auth_email_to(
        &Client::new(),
        &config(true, Some("api-key")),
        "person@example.com",
        AuthEmailPurpose::AccountDeletion,
        "token",
        &endpoint,
    )
    .await
    .expect("email delivery");
    let request = server.join().expect("server thread");
    let request_lower = request.to_ascii_lowercase();

    assert!(delivery.local_url.is_none());
    assert!(request.starts_with("POST /emails HTTP/1.1"));
    assert!(request_lower.contains("authorization: bearer api-key"));
    assert!(request_lower.contains("idempotency-key:"));
    assert!(request.contains(r#""from":"aAIdle <accounts@aaidle.com>""#));
    assert!(request.contains(r#""to":["person@example.com"]"#));
    assert!(request.contains("Confirm deletion of your aAIdle account"));
    assert!(request.contains("This link expires in 5 minutes."));
    assert!(request.contains("permanently deletes your account"));
}

#[tokio::test]
async fn rejected_delivery_is_mapped_to_a_stable_error() {
    let (endpoint, server) = local_server("429 Too Many Requests");

    let error = send_auth_email_to(
        &Client::new(),
        &config(true, Some("api-key")),
        "person@example.com",
        AuthEmailPurpose::EmailVerification,
        "token",
        &endpoint,
    )
    .await
    .err()
    .expect("rejected email should fail");
    server.join().expect("server thread");

    assert!(matches!(error, AppError::Unavailable(_)));
    assert!(error.to_string().contains("could not be delivered"));
}

#[tokio::test]
async fn transport_failures_are_mapped_to_a_stable_error() {
    let client = Client::builder()
        .timeout(Duration::from_millis(100))
        .proxy(Proxy::all("http://127.0.0.1:0").unwrap())
        .build()
        .unwrap();
    let error = send_auth_email(
        &client,
        &config(true, Some("api-key")),
        "person@example.com",
        AuthEmailPurpose::AccountDeletion,
        "token",
    )
    .await
    .err()
    .expect("unreachable proxy should fail");

    assert!(matches!(error, AppError::Unavailable(_)));
    assert!(error.to_string().contains("could not be delivered"));
}
