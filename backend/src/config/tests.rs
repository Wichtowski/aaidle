use super::*;

const CONFIG_KEYS: &[&str] = &[
    "AIDLE_ENV",
    "NODE_ENV",
    "AIDLE_BIND_ADDR",
    "DATABASE_URL",
    "REQUEST_TIMEOUT_SECONDS",
    "DAILY_SELECTION_SECRET",
    "APP_ORIGIN",
    "AUTH_SECRET",
    "HEALTH_KEY",
    "AAIDLE_VERSION",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_ISSUES_TOKEN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "RESEND_API_KEY",
];

fn with_env<'a, R>(values: &'a [(&'a str, Option<&'a str>)], closure: impl FnOnce() -> R) -> R {
    let mut environment: Vec<(&str, Option<&str>)> =
        CONFIG_KEYS.iter().map(|key| (*key, None)).collect();
    environment.extend_from_slice(values);
    temp_env::with_vars(environment, closure)
}

fn error_message(result: AppResult<AppConfig>) -> String {
    result.expect_err("configuration should fail").to_string()
}

#[test]
fn environment_detection_honors_both_production_variables() {
    with_env(&[], || {
        assert_eq!(AppEnvironment::from_env(), AppEnvironment::Local);
        assert!(!AppEnvironment::Local.is_production());
    });
    with_env(&[("NODE_ENV", Some("production"))], || {
        assert_eq!(AppEnvironment::from_env(), AppEnvironment::Production);
    });
    with_env(&[("AIDLE_ENV", Some("production"))], || {
        assert_eq!(AppEnvironment::from_env(), AppEnvironment::Production);
        assert!(AppEnvironment::Production.is_production());
    });
    with_env(&[("AIDLE_ENV", Some("Production"))], || {
        assert_eq!(AppEnvironment::from_env(), AppEnvironment::Local);
    });
}

#[test]
fn helper_values_cover_defaults_valid_values_and_errors() {
    with_env(&[], || {
        assert_eq!(env_or("DATABASE_URL", "fallback"), "fallback");
        assert_eq!(parse_env("REQUEST_TIMEOUT_SECONDS", 17_u64).unwrap(), 17);
        assert_eq!(
            required_secret("AUTH_SECRET", false, "development").unwrap(),
            "development"
        );
        assert!(required_secret("AUTH_SECRET", true, "development").is_err());
        assert!(oauth_config("GITHUB").unwrap().is_none());
    });
    with_env(
        &[
            ("DATABASE_URL", Some("sqlite::memory:")),
            ("REQUEST_TIMEOUT_SECONDS", Some("42")),
            ("AUTH_SECRET", Some("abcdefghijklmnopqrstuvwxyz123456")),
            ("GITHUB_CLIENT_ID", Some("client")),
            ("GITHUB_CLIENT_SECRET", Some("secret")),
        ],
        || {
            assert_eq!(env_or("DATABASE_URL", "fallback"), "sqlite::memory:");
            assert_eq!(parse_env("REQUEST_TIMEOUT_SECONDS", 17_u64).unwrap(), 42);
            assert_eq!(
                required_secret("AUTH_SECRET", true, "development").unwrap(),
                "abcdefghijklmnopqrstuvwxyz123456"
            );
            let oauth = oauth_config("GITHUB").unwrap().expect("OAuth config");
            assert_eq!(oauth.client_id, "client");
            assert_eq!(oauth.client_secret, "secret");
        },
    );
    with_env(&[("REQUEST_TIMEOUT_SECONDS", Some("not-a-number"))], || {
        assert!(parse_env::<u64>("REQUEST_TIMEOUT_SECONDS", 17).is_err());
    });
    with_env(&[("AUTH_SECRET", Some("short"))], || {
        assert!(required_secret("AUTH_SECRET", false, "development").is_err());
    });
    with_env(&[("GITHUB_CLIENT_ID", Some("client"))], || {
        assert!(oauth_config("GITHUB").is_err());
    });
    with_env(&[("GITHUB_CLIENT_SECRET", Some("secret"))], || {
        assert!(oauth_config("GITHUB").is_err());
    });
    with_env(&[("GITHUB_CLIENT_SECRET", Some("  "))], || {
        assert!(oauth_config("GITHUB").unwrap().is_none());
    });
}

#[test]
fn local_configuration_uses_defaults_and_filters_blank_optional_values() {
    with_env(
        &[
            ("GITHUB_ISSUES_TOKEN", Some(" ")),
            ("RESEND_API_KEY", Some("")),
        ],
        || {
            let config = AppConfig::from_env().expect("local configuration");

            assert_eq!(config.environment, AppEnvironment::Local);
            assert_eq!(config.bind_addr, "0.0.0.0:8080".parse().unwrap());
            assert_eq!(config.database_url, "sqlite://../data/aidle.db");
            assert_eq!(config.request_timeout, Duration::from_secs(10));
            assert_eq!(config.app_origin, LOCAL_APP_ORIGIN);
            assert!(!config.secure_cookies);
            assert_eq!(config.release_version, env!("CARGO_PKG_VERSION"));
            assert!(config.github_oauth.is_none());
            assert!(config.google_oauth.is_none());
            assert!(config.github_issues_token.is_none());
            assert!(config.resend_api_key.is_none());
        },
    );
}

#[test]
fn complete_production_configuration_is_normalized() {
    with_env(
        &[
            ("AIDLE_ENV", Some("production")),
            ("AIDLE_BIND_ADDR", Some("127.0.0.1:9000")),
            ("DATABASE_URL", Some("sqlite::memory:")),
            ("REQUEST_TIMEOUT_SECONDS", Some("120")),
            (
                "DAILY_SELECTION_SECRET",
                Some("daily-selection-secret-1234567890"),
            ),
            ("APP_ORIGIN", Some("https://aaidle.example///")),
            ("AUTH_SECRET", Some("authentication-secret-123456789012")),
            ("HEALTH_KEY", Some("health-check-secret-1234567890123")),
            ("AAIDLE_VERSION", Some("v9")),
            ("GOOGLE_CLIENT_ID", Some("google-client")),
            ("GOOGLE_CLIENT_SECRET", Some("google-secret")),
            ("GITHUB_ISSUES_TOKEN", Some("issues-token")),
            ("RESEND_API_KEY", Some("resend-key")),
        ],
        || {
            let config = AppConfig::from_env().expect("production configuration");

            assert_eq!(config.environment, AppEnvironment::Production);
            assert_eq!(config.bind_addr, "127.0.0.1:9000".parse().unwrap());
            assert_eq!(config.request_timeout, Duration::from_secs(120));
            assert_eq!(config.app_origin, "https://aaidle.example");
            assert!(config.secure_cookies);
            assert_eq!(config.release_version, "v9");
            assert_eq!(config.github_issues_token.as_deref(), Some("issues-token"));
            assert_eq!(config.resend_api_key.as_deref(), Some("resend-key"));
            assert_eq!(
                config.google_oauth.expect("Google OAuth").client_id,
                "google-client"
            );
        },
    );
}

#[test]
fn configuration_rejects_invalid_early_values() {
    let cases = [
        (vec![("AIDLE_BIND_ADDR", Some("invalid"))], "socket address"),
        (
            vec![("REQUEST_TIMEOUT_SECONDS", Some("invalid"))],
            "invalid value",
        ),
        (
            vec![("REQUEST_TIMEOUT_SECONDS", Some("0"))],
            "between 1 and 120",
        ),
        (
            vec![("REQUEST_TIMEOUT_SECONDS", Some("121"))],
            "between 1 and 120",
        ),
        (
            vec![("DAILY_SELECTION_SECRET", Some("short"))],
            "at least 32 bytes",
        ),
    ];

    for (values, expected) in cases {
        with_env(&values, || {
            assert!(error_message(AppConfig::from_env()).contains(expected));
        });
    }
}

#[test]
fn production_configuration_reports_each_missing_required_value() {
    let daily_secret = (
        "DAILY_SELECTION_SECRET",
        Some("daily-selection-secret-1234567890"),
    );
    let origin = ("APP_ORIGIN", Some("https://aaidle.example"));
    let auth_secret = ("AUTH_SECRET", Some("authentication-secret-123456789012"));
    let health_key = ("HEALTH_KEY", Some("health-check-secret-1234567890123"));
    let cases = [
        (
            vec![("AIDLE_ENV", Some("production"))],
            "DAILY_SELECTION_SECRET is required",
        ),
        (
            vec![("AIDLE_ENV", Some("production")), daily_secret],
            "APP_ORIGIN is required",
        ),
        (
            vec![("AIDLE_ENV", Some("production")), daily_secret, origin],
            "AUTH_SECRET is required",
        ),
        (
            vec![
                ("AIDLE_ENV", Some("production")),
                daily_secret,
                origin,
                auth_secret,
            ],
            "HEALTH_KEY is required",
        ),
        (
            vec![
                ("AIDLE_ENV", Some("production")),
                daily_secret,
                origin,
                auth_secret,
                health_key,
            ],
            "AAIDLE_VERSION is required",
        ),
        (
            vec![
                ("AIDLE_ENV", Some("production")),
                daily_secret,
                origin,
                auth_secret,
                health_key,
                ("AAIDLE_VERSION", Some(" ")),
            ],
            "AAIDLE_VERSION is required",
        ),
    ];

    for (values, expected) in cases {
        with_env(&values, || {
            assert!(error_message(AppConfig::from_env()).contains(expected));
        });
    }
}
