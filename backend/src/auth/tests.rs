use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::mpsc::{self, Receiver},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};

use super::*;

async fn pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect test database");
    crate::db::migrate(&pool)
        .await
        .expect("migrate test database");
    pool
}

fn config() -> AppConfig {
    AppConfig {
        environment: AppEnvironment::Local,
        bind_addr: "127.0.0.1:0".parse().expect("socket address"),
        database_url: "sqlite::memory:".to_owned(),
        daily_selection_secret: "daily-selection-secret-1234567890".to_owned(),
        request_timeout: Duration::from_secs(1),
        app_origin: "https://aaidle.example".to_owned(),
        secure_cookies: false,
        auth_secret: "test secret that is longer than thirty two bytes".to_owned(),
        health_key: "health-key-that-is-longer-than-thirty-two-bytes".to_owned(),
        release_version: "test".to_owned(),
        github_oauth: Some(OAuthClientConfig {
            client_id: "github-client".to_owned(),
            client_secret: "github-secret".to_owned(),
        }),
        github_issues_token: None,
        google_oauth: Some(OAuthClientConfig {
            client_id: "google-client".to_owned(),
            client_secret: "google-secret".to_owned(),
        }),
        resend_api_key: None,
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time after Unix epoch")
        .as_millis() as i64
}

fn http_response(status: &str, body: &str) -> (String, Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let status = status.to_owned();
    let body = body.to_owned();
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut request = Vec::new();
        let mut buffer = [0; 1024];
        loop {
            let read = stream.read(&mut buffer).unwrap();
            request.extend_from_slice(&buffer[..read]);
            let headers_end = request
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|position| position + 4);
            let Some(headers_end) = headers_end else {
                continue;
            };
            let headers = String::from_utf8_lossy(&request[..headers_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            if request.len() >= headers_end + content_length {
                break;
            }
        }
        let _ = sender.send(String::from_utf8(request).unwrap());
        write!(
            stream,
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
    });
    (format!("http://{address}"), receiver)
}

#[test]
fn validates_and_normalizes_email_addresses() {
    assert_eq!(
        normalize_email("  User@Example.COM ").unwrap(),
        "user@example.com"
    );
    for invalid in [
        "missing-at.example.com",
        "@example.com",
        "user@",
        "user@localhost",
        "user name@example.com",
        &format!("{}@example.com", "a".repeat(65)),
        &format!("a@{}.com", "b".repeat(250)),
    ] {
        assert!(matches!(
            normalize_email(invalid),
            Err(AppError::Validation(_))
        ));
    }
}

#[test]
fn production_reserves_the_fixture_admin_email() {
    assert!(is_production_reserved_email(
        AppEnvironment::Production,
        " Admin@AAIdle.com "
    ));
    assert!(!is_production_reserved_email(
        AppEnvironment::Local,
        PRODUCTION_RESERVED_EMAIL
    ));
    assert!(!is_production_reserved_email(
        AppEnvironment::Production,
        "user@aaidle.com"
    ));
}

#[test]
fn validates_password_lengths_and_password_wire_formats() {
    validate_password("twelve chars", 12).unwrap();
    assert!(matches!(
        validate_password("short", 12),
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        validate_password(&"x".repeat(129), 12),
        Err(AppError::Validation(_))
    ));

    let encoded = "scrypt$MDEyMzQ1Njc4OWFiY2RlZg$jIxrBpYgB3uwp7ZZJbAJ19YSarZPKgAllt1cuxPd2HTJJ5AC2msS8rmQa4_Rm2n9o7uFNx3zKKNbcAysD1fpHg";
    assert!(verify_password("correct horse battery staple", encoded).unwrap());
    assert!(!verify_password("incorrect", encoded).unwrap());
    for malformed in [
        "missing-separators",
        "scrypt$missing-hash",
        "argon2$salt$AAAA",
        "scrypt$$AAAA",
        "scrypt$salt$not+base64",
        "scrypt$salt$AAAA",
    ] {
        assert!(!verify_password("password", malformed).unwrap());
    }

    let encoded = hash_password("correct horse battery staple").unwrap();
    assert!(encoded.starts_with("scrypt$"));
    assert!(verify_password("correct horse battery staple", &encoded).unwrap());
}

#[test]
fn validates_usernames_and_permissions() {
    assert_eq!(validate_username(None).unwrap(), None);
    assert_eq!(validate_username(Some("  ")).unwrap(), None);
    assert_eq!(
        validate_username(Some(" valid-user_1 ")).unwrap(),
        Some("valid-user_1".to_owned())
    );
    for invalid in ["ab", "a name", "invalid!", "abcdefghijklmnopqrstuvwxy"] {
        assert!(matches!(
            validate_username(Some(invalid)),
            Err(AppError::Validation(_))
        ));
    }

    for (text, permission) in [
        ("user", Permission::User),
        ("developer", Permission::Developer),
        ("superadmin", Permission::Superadmin),
    ] {
        assert_eq!(Permission::parse(text).unwrap(), permission);
        assert_eq!(permission.as_str(), text);
    }
    assert!(matches!(
        Permission::parse("owner"),
        Err(AppError::Unavailable(_))
    ));
    assert!(!Permission::User.can_manage_users());
    assert!(Permission::Developer.can_manage_users());
    assert!(Permission::Superadmin.can_manage_users());
    assert!(!Permission::User.can_manage_administrators());
    assert!(!Permission::Developer.can_manage_administrators());
    assert!(Permission::Superadmin.can_manage_administrators());
}

#[test]
fn converts_stored_users_with_optional_and_invalid_values() {
    let minimal = SessionUser::try_from(UserRow {
        id: "minimal".to_owned(),
        email: "minimal@example.com".to_owned(),
        display_name: None,
        username: None,
        password_hash: None,
        email_verified_at: None,
        permission: "user".to_owned(),
        disabled_at: None,
        disabled_reason: None,
        issue_report_limit: 3,
    })
    .unwrap();
    assert_eq!(minimal.display_name, None);
    assert_eq!(minimal.username, None);
    assert!(!minimal.email_verified);
    assert!(!minimal.disabled);

    let complete = SessionUser::try_from(UserRow {
        id: "complete".to_owned(),
        email: "complete@example.com".to_owned(),
        display_name: Some("Complete".to_owned()),
        username: Some("complete-user".to_owned()),
        password_hash: Some("not-used".to_owned()),
        email_verified_at: Some(1),
        permission: "superadmin".to_owned(),
        disabled_at: Some(2),
        disabled_reason: Some("reason".to_owned()),
        issue_report_limit: 10,
    })
    .unwrap();
    assert!(complete.email_verified);
    assert!(complete.disabled);
    assert_eq!(complete.permission, Permission::Superadmin);

    assert!(matches!(
        SessionUser::try_from(UserRow {
            id: "invalid".to_owned(),
            email: "invalid@example.com".to_owned(),
            display_name: None,
            username: None,
            password_hash: None,
            email_verified_at: None,
            permission: "invalid".to_owned(),
            disabled_at: None,
            disabled_reason: None,
            issue_report_limit: 3,
        }),
        Err(AppError::Unavailable(_))
    ));
}

#[test]
fn creates_and_verifies_api_access_tokens() {
    let app_config = config();
    let now = now_millis();
    let user = SessionUser {
        id: "user-id".to_owned(),
        email: "user@example.com".to_owned(),
        display_name: Some("User".to_owned()),
        username: Some("user-name".to_owned()),
        email_verified: true,
        permission: Permission::Developer,
        disabled: true,
        disabled_reason: Some("reason".to_owned()),
        issue_report_limit: 7,
    };
    let token = create_access_token(&user, &app_config, now).unwrap();
    let claims = verify_access_token(&token, &app_config).unwrap();
    assert_eq!(claims.sub, user.id);
    assert_eq!(claims.email, user.email);
    assert_eq!(claims.permission, "developer");
    assert!(claims.disabled);
    assert_eq!(claims.iat, now.div_euclid(1_000));
    assert_eq!(claims.exp - claims.iat, API_ACCESS_TOKEN_LIFETIME_SECONDS);
    assert!(matches!(
        verify_access_token("not-a-jwt", &app_config),
        Err(AppError::Unauthorized(_))
    ));
    let mut other_config = config();
    other_config.auth_secret = "a different sufficiently long signing secret".to_owned();
    assert!(matches!(
        verify_access_token(&token, &other_config),
        Err(AppError::Unauthorized(_))
    ));
    let expired = create_access_token(&user, &app_config, 0).unwrap();
    assert!(matches!(
        verify_access_token(&expired, &app_config),
        Err(AppError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn builds_oauth_urls_and_validates_oauth_state() {
    assert_eq!(OAuthProvider::parse("github"), Some(OAuthProvider::Github));
    assert_eq!(OAuthProvider::parse("google"), Some(OAuthProvider::Google));
    assert_eq!(OAuthProvider::parse("other"), None);

    let app_config = config();
    let github = OAuthProvider::Github
        .authorization_url(&app_config, "github-state")
        .unwrap();
    assert!(github.starts_with("https://github.com/login/oauth/authorize?"));
    assert!(github.contains("client_id=github-client"));
    assert!(github.contains("scope=read%3Auser+user%3Aemail"));
    assert!(github.contains("oauth%2Fgithub%2Fcallback"));

    let google = OAuthProvider::Google
        .authorization_url(&app_config, "google-state")
        .unwrap();
    assert!(google.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
    assert!(google.contains("response_type=code"));
    assert!(google.contains("prompt=select_account"));
    assert!(google.contains("oauth%2Fgoogle%2Fcallback"));

    let mut unavailable = config();
    unavailable.github_oauth = None;
    unavailable.google_oauth = None;
    assert!(matches!(
        OAuthProvider::Github.authorization_url(&unavailable, "state"),
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        OAuthProvider::Google.authorization_url(&unavailable, "state"),
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        oauth_identity(&Client::new(), &unavailable, OAuthProvider::Github, "code").await,
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        oauth_identity(&Client::new(), &unavailable, OAuthProvider::Google, "code").await,
        Err(AppError::Unavailable(_))
    ));

    let secret = "test secret that is longer than thirty two bytes";
    let (state, cookie) = create_oauth_state(secret, OAuthProvider::Github).unwrap();
    assert!(is_valid_oauth_state(secret, OAuthProvider::Github, &state, Some(&cookie)).unwrap());
    assert!(!is_valid_oauth_state(secret, OAuthProvider::Github, &state, None).unwrap());
    for malformed in ["", "github", "github.state", "github.state.signature.extra"] {
        assert!(
            !is_valid_oauth_state(secret, OAuthProvider::Github, &state, Some(malformed)).unwrap()
        );
    }
    assert!(!is_valid_oauth_state(secret, OAuthProvider::Google, &state, Some(&cookie)).unwrap());
    assert!(
        !is_valid_oauth_state(secret, OAuthProvider::Github, "different", Some(&cookie)).unwrap()
    );
    let tampered = format!("github.{state}.invalid-signature");
    assert!(!is_valid_oauth_state(secret, OAuthProvider::Github, &state, Some(&tampered)).unwrap());

    assert!(matches!(
        oauth_identity(&Client::new(), &app_config, OAuthProvider::Github, "").await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        oauth_identity(
            &Client::new(),
            &app_config,
            OAuthProvider::Google,
            &"x".repeat(2049)
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let offline = Client::builder()
        .proxy(reqwest::Proxy::all("http://127.0.0.1:9").unwrap())
        .timeout(Duration::from_millis(100))
        .build()
        .unwrap();
    assert!(matches!(
        oauth_identity(&offline, &app_config, OAuthProvider::Github, "code").await,
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        oauth_identity(&offline, &app_config, OAuthProvider::Google, "code").await,
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        github_identity(&offline, "token").await,
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        google_identity(&offline, "token").await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn oauth_http_responses_are_validated_and_production_requests_are_preserved() {
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let app_config = config();

    for (status, body) in [
        ("503 Service Unavailable", "{}"),
        ("200 OK", "not-json"),
        ("200 OK", "{}"),
    ] {
        let (token_url, request) = http_response(status, body);
        let defaults = OAuthEndpoints::default();
        let endpoints = OAuthEndpoints {
            github_token: &token_url,
            ..defaults
        };
        assert!(matches!(
            oauth_identity_with_endpoints(
                &client,
                &app_config,
                OAuthProvider::Github,
                "authorization-code",
                &endpoints,
            )
            .await,
            Err(AppError::Unavailable(_))
        ));
        let request = request.recv().unwrap();
        assert!(request.starts_with("POST / HTTP/1.1\r\n"));
        assert!(
            request
                .to_ascii_lowercase()
                .contains("accept: application/json")
        );
        assert!(request.contains("client_id=github-client"));
        assert!(request.contains("client_secret=github-secret"));
        assert!(request.contains("code=authorization-code"));
        assert!(request.contains("oauth%2Fgithub%2Fcallback"));
    }

    let (token_url, token_request) = http_response("200 OK", r#"{"access_token":"token"}"#);
    let (profile_url, profile_request) = http_response("200 OK", r#"{"id":42,"name":"Git Hub"}"#);
    let (emails_url, emails_request) = http_response(
        "200 OK",
        r#"[{"email":"github@example.com","primary":true,"verified":true}]"#,
    );
    let defaults = OAuthEndpoints::default();
    let endpoints = OAuthEndpoints {
        github_token: &token_url,
        github_profile: &profile_url,
        github_emails: &emails_url,
        ..defaults
    };
    let github = oauth_identity_with_endpoints(
        &client,
        &app_config,
        OAuthProvider::Github,
        "authorization-code",
        &endpoints,
    )
    .await
    .unwrap();
    assert_eq!(github.provider_user_id, "42");
    assert_eq!(github.email, "github@example.com");
    assert_eq!(github.display_name.as_deref(), Some("Git Hub"));
    assert!(
        token_request
            .recv()
            .unwrap()
            .contains("client_id=github-client")
    );
    for request in [
        profile_request.recv().unwrap(),
        emails_request.recv().unwrap(),
    ] {
        let request = request.to_ascii_lowercase();
        assert!(request.contains("authorization: bearer token"));
        assert!(request.contains("accept: application/vnd.github+json"));
        assert!(request.contains("x-github-api-version: 2022-11-28"));
        assert!(request.contains("user-agent: aidle-api"));
    }

    let (token_url, token_request) = http_response("200 OK", r#"{"access_token":"token"}"#);
    let (profile_url, profile_request) = http_response(
        "200 OK",
        r#"{"sub":"google-id","email":"google@example.com","email_verified":true,"name":"G User"}"#,
    );
    let defaults = OAuthEndpoints::default();
    let endpoints = OAuthEndpoints {
        google_token: &token_url,
        google_profile: &profile_url,
        ..defaults
    };
    let google = oauth_identity_with_endpoints(
        &client,
        &app_config,
        OAuthProvider::Google,
        "google-code",
        &endpoints,
    )
    .await
    .unwrap();
    assert_eq!(google.provider_user_id, "google-id");
    assert_eq!(google.email, "google@example.com");
    assert_eq!(google.display_name.as_deref(), Some("G User"));
    let token_request = token_request.recv().unwrap();
    assert!(token_request.contains("client_id=google-client"));
    assert!(token_request.contains("grant_type=authorization_code"));
    assert!(token_request.contains("oauth%2Fgoogle%2Fcallback"));
    assert!(
        profile_request
            .recv()
            .unwrap()
            .to_ascii_lowercase()
            .contains("authorization: bearer token")
    );
}

#[tokio::test]
async fn github_identity_rejects_invalid_provider_responses() {
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();

    for (status, body) in [
        ("503 Service Unavailable", "{}"),
        ("200 OK", "not-json"),
        ("200 OK", r#"{"name":"Missing Id"}"#),
    ] {
        let (profile_url, _) = http_response(status, body);
        assert!(matches!(
            github_identity_with_endpoints(&client, "token", &profile_url, "http://127.0.0.1:9")
                .await,
            Err(AppError::Unavailable(_))
        ));
    }

    for (status, body, validation_error) in [
        ("503 Service Unavailable", "{}", false),
        ("200 OK", "not-json", false),
        (
            "200 OK",
            r#"[{"email":"secondary@example.com","primary":false,"verified":true}]"#,
            true,
        ),
        (
            "200 OK",
            r#"[{"email":null,"primary":true,"verified":true}]"#,
            true,
        ),
    ] {
        let (profile_url, _) = http_response("200 OK", r#"{"id":7}"#);
        let (emails_url, _) = http_response(status, body);
        let error =
            match github_identity_with_endpoints(&client, "token", &profile_url, &emails_url).await
            {
                Ok(_) => panic!("invalid GitHub response was accepted"),
                Err(error) => error,
            };
        assert_eq!(matches!(error, AppError::Validation(_)), validation_error);
    }
}

#[tokio::test]
async fn google_identity_rejects_invalid_provider_responses() {
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    for (status, body) in [
        ("503 Service Unavailable", "{}"),
        ("200 OK", "not-json"),
        (
            "200 OK",
            r#"{"sub":"id","email":"user@example.com","email_verified":false}"#,
        ),
        ("200 OK", r#"{"sub":"id","email_verified":true}"#),
    ] {
        let (profile_url, _) = http_response(status, body);
        assert!(matches!(
            google_identity_with_endpoint(&client, "token", &profile_url).await,
            Err(AppError::Unavailable(_))
        ));
    }
}

#[test]
fn tokens_are_random_hashable_and_compared_safely() {
    let first = random_token();
    let second = random_token();
    assert_ne!(first, second);
    assert_ne!(token_hash(&first), token_hash(&second));
    assert_eq!(token_hash(&first), token_hash(&first));
    assert!(constant_time_eq(b"", b""));
    assert!(constant_time_eq(b"same", b"same"));
    assert!(!constant_time_eq(b"same", b"diff"));
    assert!(!constant_time_eq(b"short", b"longer"));
    assert_eq!(
        rate_limit_subject("secret", "127.0.0.1", "user@example.com").unwrap(),
        rate_limit_subject("secret", "127.0.0.1", "user@example.com").unwrap()
    );
    assert_ne!(
        rate_limit_subject("secret", "127.0.0.1", "user@example.com").unwrap(),
        rate_limit_subject("secret", "127.0.0.2", "user@example.com").unwrap()
    );
}

#[tokio::test]
async fn input_validation_precedes_auth_database_access() {
    let pool = SqlitePoolOptions::new()
        .connect_lazy("sqlite::memory:")
        .unwrap();
    pool.close().await;

    assert!(matches!(
        register_with_password(&pool, "invalid", "correct horse battery staple", 1).await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        register_with_password(&pool, "valid@example.com", "short", 1).await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        register_with_password_and_username(
            &pool,
            "valid@example.com",
            "correct horse battery staple",
            Some("!invalid"),
            1,
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        verify_password_credentials(&pool, "valid@example.com", "").await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        verify_password_credentials(&pool, "invalid", "password").await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        create_email_verification_token_for_email(&pool, "invalid", 1).await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        create_password_reset_token(&pool, "invalid", 1).await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        find_or_create_oauth_user(
            &pool,
            AppEnvironment::Local,
            OAuthProvider::Github,
            OAuthIdentity {
                provider_user_id: "id".to_owned(),
                email: "invalid".to_owned(),
                display_name: None,
            },
            1,
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn registers_users_and_verifies_credentials_and_conflicts() {
    let pool = pool().await;
    let user = register_with_password_and_username(
        &pool,
        " User@Example.COM ",
        "correct horse battery staple",
        Some("First_User"),
        100,
    )
    .await
    .unwrap();
    assert_eq!(user.email, "user@example.com");
    assert_eq!(user.username.as_deref(), Some("First_User"));
    assert_eq!(user.permission, Permission::User);
    assert!(!user.email_verified);
    assert!(!user.disabled);
    assert_eq!(user.issue_report_limit, 2);

    let authenticated =
        verify_password_credentials(&pool, "USER@example.com", "correct horse battery staple")
            .await
            .unwrap();
    assert_eq!(authenticated, user);
    assert!(matches!(
        verify_password_credentials(&pool, "user@example.com", "wrong")
            .await
            .unwrap_err(),
        AppError::Unauthorized(_)
    ));
    assert!(matches!(
        verify_password_credentials(&pool, "missing@example.com", "any")
            .await
            .unwrap_err(),
        AppError::Unauthorized(_)
    ));

    assert!(matches!(
        register_with_password(
            &pool,
            "user@example.com",
            "another secure password",
            101
        )
        .await
        .unwrap_err(),
        AppError::Conflict(code) if code == "ACCOUNT_EXISTS"
    ));
    assert!(matches!(
        register_with_password_and_username(
            &pool,
            "other@example.com",
            "another secure password",
            Some("first_user"),
            102
        )
        .await
        .unwrap_err(),
        AppError::Conflict(code) if code == "USERNAME_TAKEN"
    ));

    sqlx::query("INSERT INTO users (id, email, email_normalized, created_at, updated_at) VALUES ('oauth-only', 'oauth@example.com', 'oauth@example.com', 1, 1)")
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        verify_password_credentials(&pool, "oauth@example.com", "password")
            .await
            .unwrap_err(),
        AppError::Unauthorized(_)
    ));

    sqlx::query("UPDATE users SET password_hash = 'scrypt$salt$AAAA' WHERE id = ?")
        .bind(&user.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        verify_password_credentials(&pool, "user@example.com", "password")
            .await
            .unwrap_err(),
        AppError::Unauthorized(_)
    ));
}

#[tokio::test]
async fn recognizes_username_unique_database_errors() {
    let pool = pool().await;
    register_with_password_and_username(
        &pool,
        "one@example.com",
        "correct horse battery staple",
        Some("UniqueName"),
        1,
    )
    .await
    .unwrap();
    let error = sqlx::query("INSERT INTO users (id, email, email_normalized, username, created_at, updated_at) VALUES ('two', 'two@example.com', 'two@example.com', 'uniquename', 2, 2)")
        .execute(&pool)
        .await
        .unwrap_err();
    assert!(is_username_unique_violation(&error));
    sqlx::query("DROP INDEX users_username_ci_idx")
        .execute(&pool)
        .await
        .unwrap();
    let column_error = sqlx::query("INSERT INTO users (id, email, email_normalized, username, created_at, updated_at) VALUES ('three', 'three@example.com', 'three@example.com', 'UniqueName', 3, 3)")
        .execute(&pool)
        .await
        .unwrap_err();
    assert!(is_username_unique_violation(&column_error));
    assert!(!is_username_unique_violation(&sqlx::Error::RowNotFound));
    let syntax_error = sqlx::query("SELECT * FROM no_such_table")
        .execute(&pool)
        .await
        .unwrap_err();
    assert!(!is_username_unique_violation(&syntax_error));
}

#[tokio::test]
async fn creates_rotates_authenticates_and_deletes_sessions() {
    let pool = pool().await;
    let user = register_with_password(
        &pool,
        "session@example.com",
        "correct horse battery staple",
        1_000,
    )
    .await
    .unwrap();
    assert_eq!(user_for_session(&pool, None, 1_000).await.unwrap(), None);
    assert!(!session_is_recent(&pool, None, 1_000).await.unwrap());
    delete_session(&pool, None).await.unwrap();

    let first = create_session(&pool, &user.id, 1_000).await.unwrap();
    assert!(
        !session_is_recent(&pool, Some("unknown"), 1_001)
            .await
            .unwrap()
    );
    assert_eq!(
        user_for_session(&pool, Some("unknown"), 1_001)
            .await
            .unwrap(),
        None
    );
    delete_session(&pool, Some("unknown")).await.unwrap();
    assert!(session_is_recent(&pool, Some(&first), 1_001).await.unwrap());
    assert_eq!(
        user_for_session(&pool, Some(&first), 1_001).await.unwrap(),
        Some(user.clone())
    );
    assert!(
        !session_is_recent(&pool, Some(&first), 1_000 + RECENT_AUTHENTICATION_MILLIS)
            .await
            .unwrap()
    );
    assert_eq!(
        user_for_session(&pool, Some(&first), 1_000 + SESSION_LIFETIME_MILLIS)
            .await
            .unwrap(),
        None
    );
    let last_seen: i64 =
        sqlx::query_scalar("SELECT last_seen_at FROM user_sessions WHERE token_hash = ?")
            .bind(token_hash(&first))
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(last_seen, 1_001);

    let second = rotate_session(&pool, &user.id, Some(&first), 2_000)
        .await
        .unwrap();
    assert_eq!(
        user_for_session(&pool, Some(&first), 2_000).await.unwrap(),
        None
    );
    assert_eq!(
        user_for_session(&pool, Some(&second), 2_000).await.unwrap(),
        Some(user)
    );
    assert!(
        !session_is_recent(&pool, Some(&second), 2_000 + RECENT_AUTHENTICATION_MILLIS)
            .await
            .unwrap()
    );
    sqlx::query("UPDATE user_sessions SET expires_at = 10 WHERE token_hash = ?")
        .bind(token_hash(&second))
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        user_for_session(&pool, Some(&second), 11).await.unwrap(),
        None
    );
    assert!(!session_is_recent(&pool, Some(&second), 11).await.unwrap());
    delete_session(&pool, Some(&second)).await.unwrap();
}

#[tokio::test]
async fn access_tokens_are_checked_against_current_user_state() {
    let pool = pool().await;
    let user = register_with_password(
        &pool,
        "access@example.com",
        "correct horse battery staple",
        1,
    )
    .await
    .unwrap();
    let config = config();
    assert_eq!(
        user_for_access_token(&pool, None, &config).await.unwrap(),
        None
    );
    let token = create_access_token(&user, &config, now_millis()).unwrap();
    assert_eq!(
        user_for_access_token(&pool, Some(&token), &config)
            .await
            .unwrap(),
        Some(user.clone())
    );
    assert!(matches!(
        user_for_access_token(&pool, Some("invalid"), &config).await,
        Err(AppError::Unauthorized(_))
    ));

    sqlx::query("UPDATE users SET email = 'changed@example.com', email_normalized = 'changed@example.com' WHERE id = ?")
        .bind(&user.id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        user_for_access_token(&pool, Some(&token), &config)
            .await
            .unwrap(),
        None
    );
    sqlx::query(
        "UPDATE users SET email = ?, email_normalized = ?, permission = 'developer' WHERE id = ?",
    )
    .bind(&user.email)
    .bind(&user.email)
    .bind(&user.id)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        user_for_access_token(&pool, Some(&token), &config)
            .await
            .unwrap(),
        None
    );
    sqlx::query("UPDATE users SET permission = 'user' WHERE id = ?")
        .bind(&user.id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        user_for_access_token(&pool, Some(&token), &config)
            .await
            .unwrap(),
        Some(user.clone())
    );

    sqlx::query("UPDATE users SET disabled_at = 2, disabled_reason = 'moderated' WHERE id = ?")
        .bind(&user.id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        user_for_access_token(&pool, Some(&token), &config)
            .await
            .unwrap(),
        None
    );
    let disabled =
        verify_password_credentials(&pool, "access@example.com", "correct horse battery staple")
            .await
            .unwrap();
    assert!(disabled.disabled);
    assert_eq!(disabled.disabled_reason.as_deref(), Some("moderated"));
    let disabled_token = create_access_token(&disabled, &config, now_millis()).unwrap();
    assert_eq!(
        user_for_access_token(&pool, Some(&disabled_token), &config)
            .await
            .unwrap(),
        Some(disabled)
    );

    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&user.id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        user_for_access_token(&pool, Some(&disabled_token), &config)
            .await
            .unwrap(),
        None
    );
}

#[tokio::test]
async fn creates_consumes_and_expires_email_tokens() {
    let pool = pool().await;
    let user = register_with_password(&pool, "tokens@example.com", "old secure password", 1_000)
        .await
        .unwrap();
    assert_eq!(
        create_email_verification_token_for_email(&pool, "missing@example.com", 1_000)
            .await
            .unwrap(),
        None
    );
    let (_, first) = create_email_verification_token_for_email(&pool, "tokens@example.com", 1_000)
        .await
        .unwrap()
        .unwrap();
    let (_, replacement) =
        create_email_verification_token_for_email(&pool, "tokens@example.com", 1_001)
            .await
            .unwrap()
            .unwrap();
    assert!(!verify_email_address(&pool, &first, 1_002).await.unwrap());
    assert!(
        verify_email_address(&pool, &replacement, 1_002)
            .await
            .unwrap()
    );
    assert!(
        !verify_email_address(&pool, &replacement, 1_003)
            .await
            .unwrap()
    );
    assert_eq!(
        create_email_verification_token_for_email(&pool, "tokens@example.com", 1_004)
            .await
            .unwrap(),
        None
    );
    let expired_verification = create_email_verification_token(&pool, &user.id, 1_005)
        .await
        .unwrap();
    assert!(
        !verify_email_address(
            &pool,
            &expired_verification,
            1_005 + EMAIL_VERIFICATION_LIFETIME_MILLIS
        )
        .await
        .unwrap()
    );

    let session = create_session(&pool, &user.id, 2_000).await.unwrap();
    assert_eq!(
        create_password_reset_token(&pool, "missing@example.com", 2_000)
            .await
            .unwrap(),
        None
    );
    let (email, reset) = create_password_reset_token(&pool, "tokens@example.com", 2_000)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(email, "tokens@example.com");
    assert!(matches!(
        reset_password_with_token(&pool, &reset, "short", 2_001).await,
        Err(AppError::Validation(_))
    ));
    assert_eq!(
        reset_password_with_token(&pool, "invalid", "new secure password", 2_001)
            .await
            .unwrap(),
        None
    );
    assert_eq!(
        reset_password_with_token(&pool, &reset, "new secure password", 2_001)
            .await
            .unwrap(),
        Some(user.id.clone())
    );
    assert_eq!(
        user_for_session(&pool, Some(&session), 2_002)
            .await
            .unwrap(),
        None
    );
    assert!(
        verify_password_credentials(&pool, "tokens@example.com", "new secure password")
            .await
            .is_ok()
    );
    assert_eq!(
        reset_password_with_token(&pool, &reset, "another secure password", 2_002)
            .await
            .unwrap(),
        None
    );

    let expired = create_password_reset_token(&pool, "tokens@example.com", 3_000)
        .await
        .unwrap()
        .unwrap()
        .1;
    assert_eq!(
        reset_password_with_token(
            &pool,
            &expired,
            "another secure password",
            3_000 + PASSWORD_RESET_LIFETIME_MILLIS
        )
        .await
        .unwrap(),
        None
    );
}

#[tokio::test]
async fn account_deletion_tokens_are_user_bound_and_expire() {
    let pool = pool().await;
    let first = register_with_password(
        &pool,
        "delete@example.com",
        "correct horse battery staple",
        1_000,
    )
    .await
    .unwrap();
    let second = register_with_password(
        &pool,
        "keep@example.com",
        "correct horse battery staple",
        1_000,
    )
    .await
    .unwrap();
    let token = create_account_deletion_token(&pool, &first.id, 1_000)
        .await
        .unwrap();
    assert_eq!(
        account_deletion_expiry_for_user(&pool, &token, &first.id, 1_001)
            .await
            .unwrap(),
        Some(1_000 + ACCOUNT_DELETION_LIFETIME_MILLIS)
    );
    assert_eq!(
        account_deletion_expiry_for_user(&pool, &token, &second.id, 1_001)
            .await
            .unwrap(),
        None
    );
    assert!(
        !delete_account_with_token(&pool, &token, &second.id, 1_001)
            .await
            .unwrap()
    );
    assert!(
        !delete_account_with_token(&pool, "invalid", &first.id, 1_001)
            .await
            .unwrap()
    );
    assert!(
        delete_account_with_token(&pool, &token, &first.id, 1_001)
            .await
            .unwrap()
    );
    assert!(
        !delete_account_with_token(&pool, &token, &first.id, 1_002)
            .await
            .unwrap()
    );

    let expired = create_account_deletion_token(&pool, &second.id, 2_000)
        .await
        .unwrap();
    let expiry = 2_000 + ACCOUNT_DELETION_LIFETIME_MILLIS;
    assert_eq!(
        account_deletion_expiry_for_user(&pool, &expired, &second.id, expiry)
            .await
            .unwrap(),
        None
    );
    assert!(
        !delete_account_with_token(&pool, &expired, &second.id, expiry)
            .await
            .unwrap()
    );
}

#[tokio::test]
async fn finds_links_and_creates_oauth_users() {
    let pool = pool().await;
    let created = find_or_create_oauth_user(
        &pool,
        AppEnvironment::Local,
        OAuthProvider::Github,
        OAuthIdentity {
            provider_user_id: "github-1".to_owned(),
            email: " OAuth@Example.COM ".to_owned(),
            display_name: Some("OAuth User".to_owned()),
        },
        1_000,
    )
    .await
    .unwrap();
    assert_eq!(created.email, "oauth@example.com");
    assert_eq!(created.display_name.as_deref(), Some("OAuth User"));
    assert!(created.email_verified);

    let existing_identity = find_or_create_oauth_user(
        &pool,
        AppEnvironment::Local,
        OAuthProvider::Github,
        OAuthIdentity {
            provider_user_id: "github-1".to_owned(),
            email: "ignored@example.com".to_owned(),
            display_name: None,
        },
        2_000,
    )
    .await
    .unwrap();
    assert_eq!(existing_identity, created);

    let unnamed = find_or_create_oauth_user(
        &pool,
        AppEnvironment::Local,
        OAuthProvider::Google,
        OAuthIdentity {
            provider_user_id: "google-unnamed".to_owned(),
            email: "unnamed@example.com".to_owned(),
            display_name: None,
        },
        2_001,
    )
    .await
    .unwrap();
    assert_eq!(unnamed.display_name, None);
    assert!(unnamed.email_verified);

    let password_user = register_with_password(
        &pool,
        "linked@example.com",
        "correct horse battery staple",
        3_000,
    )
    .await
    .unwrap();
    let linked = find_or_create_oauth_user(
        &pool,
        AppEnvironment::Local,
        OAuthProvider::Google,
        OAuthIdentity {
            provider_user_id: "google-1".to_owned(),
            email: "LINKED@example.com".to_owned(),
            display_name: Some("Linked Name".to_owned()),
        },
        3_001,
    )
    .await
    .unwrap();
    assert_eq!(linked.id, password_user.id);
    assert!(linked.email_verified);
    assert_eq!(linked.display_name.as_deref(), Some("Linked Name"));

    let named = register_with_password(
        &pool,
        "named@example.com",
        "correct horse battery staple",
        3_100,
    )
    .await
    .unwrap();
    sqlx::query("UPDATE users SET display_name = 'Existing Name' WHERE id = ?")
        .bind(&named.id)
        .execute(&pool)
        .await
        .unwrap();
    let preserved = find_or_create_oauth_user(
        &pool,
        AppEnvironment::Local,
        OAuthProvider::Github,
        OAuthIdentity {
            provider_user_id: "github-named".to_owned(),
            email: "named@example.com".to_owned(),
            display_name: Some("Replacement Name".to_owned()),
        },
        3_101,
    )
    .await
    .unwrap();
    assert_eq!(preserved.display_name.as_deref(), Some("Existing Name"));

    assert!(matches!(
        find_or_create_oauth_user(
            &pool,
            AppEnvironment::Production,
            OAuthProvider::Google,
            OAuthIdentity {
                provider_user_id: "reserved".to_owned(),
                email: PRODUCTION_RESERVED_EMAIL.to_owned(),
                display_name: None,
            },
            4_000,
        )
        .await
        .unwrap_err(),
        AppError::Forbidden(_)
    ));
}

#[tokio::test]
async fn consumes_and_purges_rate_limits() {
    let pool = pool().await;
    assert!(
        consume_rate_limit(&pool, "login", "subject", 2, 100, 1_000)
            .await
            .unwrap()
    );
    assert!(
        consume_rate_limit(&pool, "login", "subject", 2, 100, 1_001)
            .await
            .unwrap()
    );
    assert!(
        !consume_rate_limit(&pool, "login", "subject", 2, 100, 1_002)
            .await
            .unwrap()
    );
    assert!(
        consume_rate_limit(&pool, "login", "other", 1, 100, 1_002)
            .await
            .unwrap()
    );
    assert!(
        consume_rate_limit(&pool, "login", "subject", 2, 100, 1_100)
            .await
            .unwrap()
    );
    assert_eq!(purge_expired_rate_limits(&pool, 1_101).await.unwrap(), 2);
    assert_eq!(purge_expired_rate_limits(&pool, 1_101).await.unwrap(), 0);
}

#[tokio::test]
async fn grants_and_detects_hardcore_access_from_both_tables() {
    let pool = pool().await;
    let first = register_with_password(
        &pool,
        "hardcore@example.com",
        "correct horse battery staple",
        1,
    )
    .await
    .unwrap();
    assert!(!has_hardcore_access(&pool, &first.id).await.unwrap());
    grant_hardcore_access(&pool, &first.id, 2).await.unwrap();
    grant_hardcore_access(&pool, &first.id, 3).await.unwrap();
    assert!(has_hardcore_access(&pool, &first.id).await.unwrap());

    let second = register_with_password(
        &pool,
        "legacy@example.com",
        "correct horse battery staple",
        1,
    )
    .await
    .unwrap();
    sqlx::query("INSERT INTO user_hardcore_access (user_id, unlocked_at) VALUES (?, 2)")
        .bind(&second.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(has_hardcore_access(&pool, &second.id).await.unwrap());
}

#[tokio::test]
async fn transactional_constraint_errors_roll_back_auth_changes() {
    let pool = pool().await;
    let user = register_with_password(
        &pool,
        "rollback@example.com",
        "correct horse battery staple",
        1,
    )
    .await
    .unwrap();
    let session = create_session(&pool, &user.id, 2).await.unwrap();
    assert!(
        rotate_session(&pool, "missing-user", Some(&session), 3)
            .await
            .is_err()
    );
    assert_eq!(
        user_for_session(&pool, Some(&session), 4).await.unwrap(),
        Some(user.clone())
    );
    assert!(
        create_email_verification_token(&pool, "missing-user", 3)
            .await
            .is_err()
    );
    assert!(
        create_account_deletion_token(&pool, "missing-user", 3)
            .await
            .is_err()
    );

    find_or_create_oauth_user(
        &pool,
        AppEnvironment::Local,
        OAuthProvider::Github,
        OAuthIdentity {
            provider_user_id: "first-provider-id".to_owned(),
            email: user.email.clone(),
            display_name: None,
        },
        5,
    )
    .await
    .unwrap();
    assert!(
        find_or_create_oauth_user(
            &pool,
            AppEnvironment::Local,
            OAuthProvider::Github,
            OAuthIdentity {
                provider_user_id: "second-provider-id".to_owned(),
                email: user.email,
                display_name: None,
            },
            6,
        )
        .await
        .is_err()
    );
}

#[tokio::test]
async fn transactional_database_errors_propagate_and_preserve_auth_state() {
    let pool = pool().await;
    let user = register_with_password(
        &pool,
        "database-errors@example.com",
        "correct horse battery staple",
        1,
    )
    .await
    .unwrap();

    let verification = create_email_verification_token(&pool, &user.id, 2)
        .await
        .unwrap();
    sqlx::query(
        "CREATE TRIGGER fail_auth_token_delete BEFORE DELETE ON auth_email_tokens BEGIN SELECT RAISE(FAIL, 'forced token delete failure'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        create_email_verification_token(&pool, &user.id, 3)
            .await
            .is_err()
    );
    assert!(verify_email_address(&pool, &verification, 3).await.is_err());
    sqlx::query("DROP TRIGGER fail_auth_token_delete")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        "CREATE TRIGGER fail_user_update BEFORE UPDATE ON users BEGIN SELECT RAISE(FAIL, 'forced user update failure'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(verify_email_address(&pool, &verification, 3).await.is_err());
    sqlx::query("DROP TRIGGER fail_user_update")
        .execute(&pool)
        .await
        .unwrap();
    assert!(verify_email_address(&pool, &verification, 3).await.unwrap());

    let reset = create_password_reset_token(&pool, &user.email, 4)
        .await
        .unwrap()
        .unwrap()
        .1;
    sqlx::query(
        "CREATE TRIGGER fail_password_update BEFORE UPDATE OF password_hash ON users BEGIN SELECT RAISE(FAIL, 'forced password update failure'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        reset_password_with_token(&pool, &reset, "another secure password", 5)
            .await
            .is_err()
    );
    sqlx::query("DROP TRIGGER fail_password_update")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        reset_password_with_token(&pool, &reset, "another secure password", 5)
            .await
            .unwrap(),
        Some(user.id.clone())
    );

    let session = create_session(&pool, &user.id, 6).await.unwrap();
    let reset = create_password_reset_token(&pool, &user.email, 7)
        .await
        .unwrap()
        .unwrap()
        .1;
    sqlx::query(
        "CREATE TRIGGER fail_session_delete BEFORE DELETE ON user_sessions BEGIN SELECT RAISE(FAIL, 'forced session delete failure'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        reset_password_with_token(&pool, &reset, "third secure password", 8)
            .await
            .is_err()
    );
    assert_eq!(
        user_for_session(&pool, Some(&session), 8)
            .await
            .unwrap()
            .map(|session_user| session_user.id),
        Some(user.id.clone())
    );
    sqlx::query("DROP TRIGGER fail_session_delete")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        reset_password_with_token(&pool, &reset, "third secure password", 8)
            .await
            .unwrap(),
        Some(user.id)
    );
}

#[tokio::test]
async fn oauth_database_errors_propagate_from_each_write_stage() {
    let pool = pool().await;
    let user = register_with_password(
        &pool,
        "oauth-errors@example.com",
        "correct horse battery staple",
        1,
    )
    .await
    .unwrap();

    sqlx::query(
        "CREATE TRIGGER fail_oauth_user_update BEFORE UPDATE ON users BEGIN SELECT RAISE(FAIL, 'forced oauth user update failure'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        find_or_create_oauth_user(
            &pool,
            AppEnvironment::Local,
            OAuthProvider::Github,
            OAuthIdentity {
                provider_user_id: "update-error".to_owned(),
                email: user.email.clone(),
                display_name: None,
            },
            2,
        )
        .await
        .is_err()
    );
    sqlx::query("DROP TRIGGER fail_oauth_user_update")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        "CREATE TRIGGER fail_oauth_user_insert BEFORE INSERT ON users BEGIN SELECT RAISE(FAIL, 'forced oauth user insert failure'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        find_or_create_oauth_user(
            &pool,
            AppEnvironment::Local,
            OAuthProvider::Google,
            OAuthIdentity {
                provider_user_id: "insert-error".to_owned(),
                email: "new-oauth-errors@example.com".to_owned(),
                display_name: None,
            },
            3,
        )
        .await
        .is_err()
    );
    sqlx::query("DROP TRIGGER fail_oauth_user_insert")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        "CREATE TRIGGER remove_oauth_user AFTER INSERT ON user_identities BEGIN DELETE FROM users WHERE id = NEW.user_id; END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        find_or_create_oauth_user(
            &pool,
            AppEnvironment::Local,
            OAuthProvider::Google,
            OAuthIdentity {
                provider_user_id: "fetch-error".to_owned(),
                email: "removed-oauth@example.com".to_owned(),
                display_name: None,
            },
            4,
        )
        .await
        .is_err()
    );
}

#[tokio::test]
async fn invalid_stored_permissions_and_closed_database_errors_propagate() {
    let pool = pool().await;
    let user = register_with_password(
        &pool,
        "invalid-permission@example.com",
        "correct horse battery staple",
        1,
    )
    .await
    .unwrap();
    sqlx::query("PRAGMA ignore_check_constraints = ON")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE users SET permission = 'invalid' WHERE id = ?")
        .bind(&user.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        verify_password_credentials(
            &pool,
            "invalid-permission@example.com",
            "correct horse battery staple"
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
    let session = create_session(&pool, &user.id, 2).await.unwrap();
    assert!(matches!(
        user_for_session(&pool, Some(&session), 3).await,
        Err(AppError::Unavailable(_))
    ));
    let access_token = create_access_token(&user, &config(), now_millis()).unwrap();
    assert!(matches!(
        user_for_access_token(&pool, Some(&access_token), &config()).await,
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        find_or_create_oauth_user(
            &pool,
            AppEnvironment::Local,
            OAuthProvider::Github,
            OAuthIdentity {
                provider_user_id: "invalid-permission".to_owned(),
                email: "invalid-permission@example.com".to_owned(),
                display_name: None,
            },
            4,
        )
        .await,
        Err(AppError::Unavailable(_))
    ));

    pool.close().await;
    assert!(
        consume_rate_limit(&pool, "scope", "subject", 1, 1, 1)
            .await
            .is_err()
    );
    assert!(purge_expired_rate_limits(&pool, 1).await.is_err());
    assert!(
        register_with_password(&pool, "new@example.com", "secure password", 1)
            .await
            .is_err()
    );
    assert!(
        verify_password_credentials(&pool, "new@example.com", "secure password")
            .await
            .is_err()
    );
    assert!(create_session(&pool, "user", 1).await.is_err());
    assert!(
        create_email_verification_token(&pool, "user", 1)
            .await
            .is_err()
    );
    assert!(
        create_email_verification_token_for_email(&pool, "new@example.com", 1)
            .await
            .is_err()
    );
    assert!(
        create_password_reset_token(&pool, "new@example.com", 1)
            .await
            .is_err()
    );
    assert!(verify_email_address(&pool, "token", 1).await.is_err());
    assert!(
        reset_password_with_token(&pool, "token", "secure password", 1)
            .await
            .is_err()
    );
    assert!(
        account_deletion_expiry_for_user(&pool, "token", "user", 1)
            .await
            .is_err()
    );
    assert!(
        delete_account_with_token(&pool, "token", "user", 1)
            .await
            .is_err()
    );
    assert!(
        find_or_create_oauth_user(
            &pool,
            AppEnvironment::Local,
            OAuthProvider::Github,
            OAuthIdentity {
                provider_user_id: "id".to_owned(),
                email: "new@example.com".to_owned(),
                display_name: None,
            },
            1,
        )
        .await
        .is_err()
    );
    assert!(delete_session(&pool, Some("token")).await.is_err());
    assert!(session_is_recent(&pool, Some("token"), 1).await.is_err());
    assert!(user_for_session(&pool, Some("token"), 1).await.is_err());
    assert!(
        user_for_access_token(
            &pool,
            Some(&create_access_token(&user, &config(), now_millis()).unwrap()),
            &config(),
        )
        .await
        .is_err()
    );
    assert!(has_hardcore_access(&pool, "user").await.is_err());
    assert!(grant_hardcore_access(&pool, "user", 1).await.is_err());
}
