use std::sync::Arc;

use axum::{body::Body, http::Request};
use http_body_util::BodyExt;
use tower::ServiceExt;

use super::*;

#[test]
fn validates_known_modes_and_model_ids() {
    assert!(is_model_id("gpt-4o"));
    assert!(is_model_id("model_2"));
    for invalid in ["", "gpt 4o", "model/2", &"a".repeat(129)] {
        assert!(!is_model_id(invalid));
        assert!(!is_token(invalid));
    }
    assert!(is_token("Abc_123-token"));
}

#[test]
fn parses_uuids_and_formats_clock_values() {
    let id = Uuid::new_v4();
    assert_eq!(parse_uuid(&id.to_string(), "invalid").unwrap(), id);
    assert!(
        matches!(parse_uuid("nope", "invalid"), Err(AppError::Validation(message)) if message == "invalid")
    );
    assert_eq!(current_utc_date().unwrap().len(), 10);
    assert!(format_next_midnight().unwrap().ends_with('Z'));
    assert!(now_millis() > 0);
}

#[test]
fn constant_time_comparison_handles_equal_different_and_unequal_length_values() {
    assert!(constant_time_eq(b"secret", b"secret"));
    assert!(!constant_time_eq(b"secret", b"secreu"));
    assert!(!constant_time_eq(b"secret", b"secret-longer"));
    assert!(constant_time_eq(b"", b""));
}

#[test]
fn bearer_cookie_and_csrf_helpers_reject_malformed_credentials() {
    let mut headers = HeaderMap::new();
    assert_eq!(bearer_token(&headers), None);
    assert_eq!(session_cookie(&headers), None);
    assert!(matches!(assert_csrf(&headers), Err(AppError::Forbidden(_))));

    headers.insert(
        header::AUTHORIZATION,
        HeaderValue::from_static("Basic value"),
    );
    headers.insert(
        header::COOKIE,
        HeaderValue::from_static("other=1; aaidle_session=session; aaidle_csrf=csrf"),
    );
    headers.insert("x-aaidle-csrf-token", HeaderValue::from_static("wrong"));
    assert_eq!(bearer_token(&headers), None);
    assert_eq!(session_cookie(&headers), Some("session"));
    assert!(matches!(assert_csrf(&headers), Err(AppError::Forbidden(_))));

    headers.insert("x-aaidle-csrf-token", HeaderValue::from_static("csrf"));
    assert!(assert_csrf(&headers).is_ok());
    headers.insert(
        header::AUTHORIZATION,
        HeaderValue::from_static("Bearer token"),
    );
    assert_eq!(bearer_token(&headers), Some("token"));
    assert!(
        assert_csrf_or_bearer(&HeaderMap::from_iter([(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer token"),
        )]))
        .is_ok()
    );
}

#[tokio::test]
async fn state_dependent_security_and_response_helpers_cover_both_cookie_modes() {
    let mut state = test_support::state().await;
    let mut headers = HeaderMap::new();
    assert!(matches!(
        assert_same_origin(&state, &headers),
        Err(AppError::Forbidden(_))
    ));
    headers.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    assert!(assert_same_origin(&state, &headers).is_ok());
    assert!(assert_same_origin_or_bearer(&state, &headers).is_ok());
    assert!(
        assert_same_origin_or_bearer(
            &state,
            &HeaderMap::from_iter([(
                header::AUTHORIZATION,
                HeaderValue::from_static("Bearer token"),
            )]),
        )
        .is_ok()
    );

    let session = cookie_header(&state, "value", 60).unwrap();
    assert!(session.to_str().unwrap().contains("SameSite=Lax; HttpOnly"));
    let csrf = csrf_cookie_header(&state, "value", 60).unwrap();
    assert!(csrf.to_str().unwrap().contains("SameSite=Strict"));
    let response_headers = no_store_with_cookie(&state, "session".to_owned()).unwrap();
    assert_eq!(
        response_headers.get_all(header::SET_COOKIE).iter().count(),
        2
    );

    Arc::get_mut(&mut state.config).unwrap().secure_cookies = true;
    assert!(
        cookie_header(&state, "value", 60)
            .unwrap()
            .to_str()
            .unwrap()
            .ends_with("; Secure")
    );
    assert!(
        csrf_cookie_header(&state, "value", 60)
            .unwrap()
            .to_str()
            .unwrap()
            .ends_with("; Secure")
    );

    let local = redirect(&state, "/classic", None, StatusCode::SEE_OTHER).unwrap();
    assert_eq!(
        local.headers()[header::LOCATION],
        "http://localhost:3000/classic"
    );
    let external = redirect(
        &state,
        "https://example.com/oauth",
        Some(("temporary", "token".to_owned(), 60)),
        StatusCode::FOUND,
    )
    .unwrap();
    assert_eq!(
        external.headers()[header::LOCATION],
        "https://example.com/oauth"
    );
    let external_http = redirect(&state, "http://example.com", None, StatusCode::FOUND).unwrap();
    assert_eq!(
        external_http.headers()[header::LOCATION],
        "http://example.com"
    );
    assert_eq!(
        external
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .count(),
        1
    );
}

#[tokio::test]
async fn health_models_and_authentication_rejection_paths_are_isolated() {
    let state = test_support::state().await;
    let unauthorized = health(State(state.clone()), HeaderMap::new()).await;
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let mut headers = HeaderMap::new();
    headers.insert(
        HEALTH_KEY_HEADER,
        HeaderValue::from_static("test health key that is longer than thirty two bytes"),
    );
    assert_eq!(
        health(State(state.clone()), headers.clone()).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        ready(State(state.clone()), headers).await.status(),
        StatusCode::OK
    );

    assert!(matches!(
        models(
            State(state.clone()),
            Query(ModelsQuery {
                cursor: Some("x".repeat(129)),
                limit: None
            })
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        models(
            State(state.clone()),
            Query(ModelsQuery {
                cursor: None,
                limit: Some(0)
            })
        )
        .await,
        Err(AppError::Validation(_))
    ));
    let response = models(
        State(state.clone()),
        Query(ModelsQuery {
            cursor: None,
            limit: Some(1),
        }),
    )
    .await
    .unwrap()
    .into_response();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()[header::CACHE_CONTROL],
        "public, max-age=300, s-maxage=3600"
    );
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(body["models"], serde_json::json!([]));
    assert!(body["nextCursor"].is_null());
    assert!(matches!(
        authenticated_user(&state, &HeaderMap::new()).await,
        Err(AppError::Unauthorized(_))
    ));
    let bearer_headers = HeaderMap::from_iter([(
        header::AUTHORIZATION,
        HeaderValue::from_static("Bearer missing-token"),
    )]);
    assert!(matches!(
        optional_authenticated_user(&state, &bearer_headers).await,
        Err(AppError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn readiness_rejects_missing_authorization_and_reports_database_failures() {
    let state = test_support::state().await;
    assert_eq!(
        ready(State(state.clone()), HeaderMap::new()).await.status(),
        StatusCode::UNAUTHORIZED
    );

    state.db.close().await;
    let headers = HeaderMap::from_iter([(
        HeaderName::from_static(HEALTH_KEY_HEADER),
        HeaderValue::from_static("test health key that is longer than thirty two bytes"),
    )]);

    assert_eq!(
        ready(State(state), headers).await.status(),
        StatusCode::INTERNAL_SERVER_ERROR
    );
}

#[tokio::test]
async fn top_level_router_applies_security_headers() {
    let response = crate::api::router(test_support::state().await)
        .oneshot(Request::get("/api/v1/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    for (name, expected) in [
        (
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        ),
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        (header::X_FRAME_OPTIONS, "DENY"),
        (header::REFERRER_POLICY, "no-referrer"),
    ] {
        assert_eq!(response.headers()[name], expected);
    }
    assert_eq!(
        response.headers()["cross-origin-opener-policy"],
        "same-origin"
    );
    assert_eq!(
        response.headers()["permissions-policy"],
        "camera=(), geolocation=(), microphone=()"
    );
}

#[tokio::test]
async fn malformed_header_bytes_and_response_values_are_rejected() {
    let state = test_support::state().await;
    let invalid_text = HeaderValue::from_bytes(&[0xff]).unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(header::AUTHORIZATION, invalid_text.clone());
    headers.insert(header::COOKIE, invalid_text.clone());
    headers.insert(header::ORIGIN, invalid_text.clone());
    headers.insert("x-aaidle-csrf-token", invalid_text);

    assert_eq!(bearer_token(&headers), None);
    assert_eq!(session_cookie(&headers), None);
    assert!(matches!(
        assert_same_origin(&state, &headers),
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(assert_csrf(&headers), Err(AppError::Forbidden(_))));

    assert!(matches!(
        named_cookie_header(&state, "session", "line\nbreak", 60),
        Err(AppError::Config(_))
    ));
    assert!(matches!(
        csrf_cookie_header(&state, "line\nbreak", 60),
        Err(AppError::Config(_))
    ));
    assert!(matches!(
        redirect(&state, "line\nbreak", None, StatusCode::FOUND),
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn router_maps_oversized_json_to_the_payload_limit_contract() {
    let state = test_support::state().await;
    let challenge_id = Uuid::new_v4();
    let request = Request::post(format!("/games/timeline/challenges/{challenge_id}/start"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(format!(
            "{{\"playerId\":\"{}\",\"padding\":\"{}\"}}",
            Uuid::new_v4(),
            "x".repeat(MAX_BODY_BYTES)
        )))
        .unwrap();

    let response = router(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(body["error"]["code"], "PAYLOAD_TOO_LARGE");
}

#[test]
fn auth_user_response_only_exposes_disable_reason_for_disabled_users() {
    let user = crate::auth::SessionUser {
        id: "user".to_owned(),
        email: "user@example.com".to_owned(),
        display_name: Some("User".to_owned()),
        username: Some("user".to_owned()),
        email_verified: true,
        permission: crate::auth::Permission::User,
        disabled: false,
        disabled_reason: Some("hidden".to_owned()),
        issue_report_limit: 3,
    };
    let response = auth_user_response(user.clone());
    assert!(response.disabled_reason.is_none());
    let response = auth_user_response(crate::auth::SessionUser {
        disabled: true,
        ..user
    });
    assert_eq!(response.disabled_reason.as_deref(), Some("hidden"));
}

#[test]
fn guess_rate_limits_group_ipv6_privacy_addresses_by_prefix() {
    assert_eq!(
        guess_rate_limit_ip("2001:db8:1234:5678:1111:2222:3333:4444"),
        "2001:db8:1234:5678::"
    );
    assert_eq!(guess_rate_limit_ip("203.0.113.10"), "203.0.113.10");
    assert_eq!(guess_rate_limit_ip("not-an-ip"), "not-an-ip");
}

#[test]
fn client_ip_selection_only_trusts_the_production_proxy_header() {
    let mut headers = HeaderMap::new();
    headers.insert("cf-connecting-ip", HeaderValue::from_static("203.0.113.10"));
    headers.insert(
        "x-aaidle-client-ip",
        HeaderValue::from_static("203.0.113.10"),
    );
    assert_eq!(
        client_ip_for_request(
            crate::config::AppEnvironment::Production,
            &headers,
            Some("172.20.0.2:43210".parse().unwrap())
        ),
        "203.0.113.10"
    );
    assert_eq!(
        client_ip_for_request(
            crate::config::AppEnvironment::Local,
            &headers,
            Some("127.0.0.1:43210".parse().unwrap())
        ),
        "127.0.0.1"
    );
    headers.remove("x-aaidle-client-ip");
    assert_eq!(
        client_ip_for_request(
            crate::config::AppEnvironment::Production,
            &headers,
            Some("172.20.0.2:43210".parse().unwrap())
        ),
        "172.20.0.2"
    );
    assert_eq!(
        client_ip_for_request(crate::config::AppEnvironment::Production, &headers, None),
        "unknown"
    );

    headers.insert(
        "x-aaidle-client-ip",
        HeaderValue::from_static("not-an-address"),
    );
    assert_eq!(
        client_ip_for_request(
            crate::config::AppEnvironment::Production,
            &headers,
            Some("172.20.0.3:43210".parse().unwrap())
        ),
        "172.20.0.3"
    );
}

#[tokio::test]
async fn models_propagate_database_failures() {
    let state = test_support::state().await;
    state.db.close().await;

    assert!(matches!(
        models(
            State(state),
            Query(ModelsQuery {
                cursor: None,
                limit: None,
            }),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn guess_rate_limiting_stops_at_the_first_exhausted_scope() {
    let state = test_support::state().await;
    let player_id = Uuid::new_v4();
    let challenge_id = Uuid::new_v4();
    let ip_subject =
        crate::auth::rate_limit_subject(&state.config.auth_secret, "guess-ip", "unknown").unwrap();
    sqlx::query(
        "INSERT INTO request_rate_limits (scope, subject_hash, window_started_at, count) \
         VALUES ('guess-ip-minute', ?, ?, ?)",
    )
    .bind(ip_subject)
    .bind(now_millis())
    .bind(GUESS_IP_PER_MINUTE)
    .execute(&state.db)
    .await
    .unwrap();

    let error = consume_guess_rate_limits(&state, &HeaderMap::new(), None, player_id, challenge_id)
        .await
        .expect_err("the exhausted IP bucket rejects the guess");
    assert!(matches!(
        error,
        AppError::TooManyRequests {
            retry_after_seconds: 60,
            ..
        }
    ));
}

#[tokio::test]
async fn guess_rate_limiting_reports_the_exhausted_later_scope() {
    for (scope, subject_kind, limit, expected_retry) in [
        ("guess-ip-hour", "ip", GUESS_IP_PER_HOUR, 3_600),
        (
            "guess-player-challenge-minute",
            "player-challenge",
            GUESS_PLAYER_CHALLENGE_PER_MINUTE,
            60,
        ),
        ("guess-player-hour", "player", GUESS_PLAYER_PER_HOUR, 3_600),
    ] {
        let state = test_support::state().await;
        let player_id = Uuid::new_v4();
        let challenge_id = Uuid::new_v4();
        let subject = match subject_kind {
            "ip" => {
                crate::auth::rate_limit_subject(&state.config.auth_secret, "guess-ip", "unknown")
            }
            "player-challenge" => crate::auth::rate_limit_subject(
                &state.config.auth_secret,
                &player_id.to_string(),
                &challenge_id.to_string(),
            ),
            "player" => crate::auth::rate_limit_subject(
                &state.config.auth_secret,
                "guess-player",
                &player_id.to_string(),
            ),
            _ => unreachable!(),
        }
        .unwrap();
        sqlx::query(
            "INSERT INTO request_rate_limits (scope, subject_hash, window_started_at, count) \
             VALUES (?, ?, ?, ?)",
        )
        .bind(scope)
        .bind(subject)
        .bind(now_millis())
        .bind(limit)
        .execute(&state.db)
        .await
        .unwrap();

        let error =
            consume_guess_rate_limits(&state, &HeaderMap::new(), None, player_id, challenge_id)
                .await
                .expect_err("the exhausted bucket rejects the guess");
        assert!(matches!(
            error,
            AppError::TooManyRequests {
                retry_after_seconds,
                ..
            } if retry_after_seconds == expected_retry
        ));
    }
}
