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

fn local_server(status: &str, body: &str) -> (String, JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
    let address = listener.local_addr().expect("listener address");
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
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
    (format!("http://{address}/issues"), server)
}

fn config(github_issues_token: Option<&str>) -> AppConfig {
    AppConfig {
        environment: AppEnvironment::Local,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        database_url: "sqlite::memory:".to_owned(),
        daily_selection_secret: "daily-selection-secret-1234567890".to_owned(),
        request_timeout: Duration::from_millis(100),
        app_origin: "http://localhost:5173".to_owned(),
        secure_cookies: false,
        auth_secret: "authentication-secret-123456789012".to_owned(),
        health_key: "health-check-secret-1234567890123".to_owned(),
        release_version: "test".to_owned(),
        github_oauth: None,
        github_issues_token: github_issues_token.map(str::to_owned),
        google_oauth: None,
        resend_api_key: None,
    }
}

#[test]
fn issue_request_serializes_title_body_and_label() {
    let request = CreateIssueRequest {
        title: "[Report] Broken challenge".to_owned(),
        body: "Details",
        labels: ["classic"],
    };
    let value = serde_json::to_value(request).expect("serialize issue");

    assert_eq!(value["title"], "[Report] Broken challenge");
    assert_eq!(value["body"], "Details");
    assert_eq!(value["labels"], serde_json::json!(["classic"]));
}

#[test]
fn issue_response_deserializes_the_public_url() {
    let response: CreateIssueResponse = serde_json::from_value(serde_json::json!({
        "html_url": "https://github.com/Wichtowski/aaidle/issues/1"
    }))
    .expect("deserialize issue response");
    assert_eq!(
        response.html_url,
        "https://github.com/Wichtowski/aaidle/issues/1"
    );
}

#[tokio::test]
async fn reporting_without_a_token_fails_before_network_access() {
    let error = create_report(
        &Client::new(),
        &config(None),
        "Broken challenge",
        "Details",
        "classic",
    )
    .await
    .expect_err("missing issue token should fail");

    assert!(matches!(error, AppError::Unavailable(_)));
    assert!(error.to_string().contains("not configured"));
}

#[tokio::test]
async fn successful_reports_send_the_expected_request_and_return_the_issue_url() {
    let (endpoint, server) = local_server(
        "201 Created",
        r#"{"html_url":"https://github.com/Wichtowski/aaidle/issues/7"}"#,
    );

    let url = create_report_at(
        &Client::new(),
        &config(Some("token")),
        "Broken challenge",
        "Detailed description",
        "classic",
        &endpoint,
    )
    .await
    .expect("created issue");
    let request = server.join().expect("server thread");
    let request_lower = request.to_ascii_lowercase();

    assert_eq!(url, "https://github.com/Wichtowski/aaidle/issues/7");
    assert!(request.starts_with("POST /issues HTTP/1.1"));
    assert!(request_lower.contains("authorization: bearer token"));
    assert!(request_lower.contains("accept: application/vnd.github+json"));
    assert!(request_lower.contains("x-github-api-version: 2022-11-28"));
    assert!(request.contains(r#""title":"[Report] Broken challenge""#));
    assert!(request.contains(r#""body":"Detailed description""#));
    assert!(request.contains(r#""labels":["classic"]"#));
}

#[tokio::test]
async fn rejected_and_malformed_responses_are_mapped_to_a_stable_error() {
    for (status, body) in [
        ("422 Unprocessable Entity", r#"{"message":"invalid"}"#),
        ("201 Created", "not-json"),
    ] {
        let (endpoint, server) = local_server(status, body);
        let error = create_report_at(
            &Client::new(),
            &config(Some("token")),
            "Broken challenge",
            "Details",
            "classic",
            &endpoint,
        )
        .await
        .expect_err("response should fail");
        server.join().expect("server thread");

        assert!(matches!(error, AppError::Unavailable(_)));
        assert!(error.to_string().contains("Could not send the report"));
    }
}

#[tokio::test]
async fn transport_failures_are_mapped_to_a_stable_error() {
    let client = Client::builder()
        .timeout(Duration::from_millis(100))
        .proxy(Proxy::all("http://127.0.0.1:0").unwrap())
        .build()
        .unwrap();
    let error = create_report(
        &client,
        &config(Some("token")),
        "Broken challenge",
        "Details",
        "classic",
    )
    .await
    .expect_err("unreachable proxy should fail");

    assert!(matches!(error, AppError::Unavailable(_)));
    assert!(error.to_string().contains("Could not send the report"));
}
