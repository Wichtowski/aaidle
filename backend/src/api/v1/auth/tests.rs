use super::*;

use axum::{
    body::Body,
    http::{HeaderValue, Request, header},
};
use reqwest::Proxy;
use tower::ServiceExt;

use crate::{
    config::{AppEnvironment, OAuthClientConfig},
    dto::{
        AccountDeletionCompletionRequest, PasswordCredentialsRequest, RegistrationRequest,
        UsernameUpdateRequest,
    },
};

fn peer() -> ConnectInfo<SocketAddr> {
    ConnectInfo("127.0.0.1:43210".parse().unwrap())
}

fn origin_headers() -> HeaderMap {
    HeaderMap::from_iter([(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    )])
}

fn authenticated_headers(session: &str, extra_cookie: Option<(&str, &str)>) -> HeaderMap {
    let mut headers = origin_headers();
    let extra = extra_cookie
        .map(|(name, value)| format!("; {name}={value}"))
        .unwrap_or_default();
    headers.insert(
        header::COOKIE,
        HeaderValue::from_str(&format!(
            "aaidle_session={session}; aaidle_csrf=test-csrf{extra}"
        ))
        .unwrap(),
    );
    headers.insert("x-aaidle-csrf-token", HeaderValue::from_static("test-csrf"));
    headers
}

#[test]
fn masks_email_without_disclosing_the_local_part() {
    assert_eq!(mask_email("alice@example.com"), "a***@example.com");
    assert_eq!(mask_email("@example.com"), "****@example.com");
    assert_eq!(mask_email("not-an-email"), "***");
}

#[tokio::test]
async fn token_link_handlers_redirect_valid_and_invalid_tokens() {
    let state = super::super::test_support::state().await;
    let invalid = password_reset_verify(
        State(state.clone()),
        Query(TokenQuery {
            token: "bad token".to_owned(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(invalid.status(), StatusCode::SEE_OTHER);
    assert!(
        invalid.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/login?error=reset-link")
    );

    let valid = password_reset_verify(
        State(state.clone()),
        Query(TokenQuery {
            token: "valid_token-1".to_owned(),
        }),
    )
    .await
    .unwrap();
    assert!(
        valid.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/reset-password")
    );
    assert!(
        valid.headers()[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .starts_with("aaidle_password_reset=valid_token-1")
    );

    let deletion = account_deletion_verify(
        State(state.clone()),
        Query(TokenQuery {
            token: "valid_token-2".to_owned(),
        }),
    )
    .await
    .unwrap();
    assert!(
        deletion.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/delete-account")
    );

    let activation = email_verification_verify(
        State(state),
        Query(TokenQuery {
            token: "bad token".to_owned(),
        }),
    )
    .await
    .unwrap();
    assert!(
        activation.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/login?error=activation")
    );
}

#[tokio::test]
async fn unauthenticated_read_handlers_return_minimal_safe_responses() {
    let state = super::super::test_support::state().await;
    let (_, Json(me_response)) = me(State(state.clone()), HeaderMap::new()).await.unwrap();
    assert!(me_response.user.is_none());

    let (_, Json(status)) = hardcore_status(State(state.clone()), HeaderMap::new())
        .await
        .unwrap();
    assert!(!status.signed_in);
    assert!(!status.unlocked);
    assert_eq!(status.required_categories.len(), 6);

    let (_, Json(deletion)) = account_deletion_status(State(state), HeaderMap::new())
        .await
        .unwrap();
    assert!(!deletion.authorized);
    assert!(deletion.masked_email.is_none());
}

#[tokio::test]
async fn mutations_reject_bad_origin_before_database_work() {
    let state = super::super::test_support::state().await;
    let result = update_username(
        State(state.clone()),
        HeaderMap::new(),
        Ok(Json(UsernameUpdateRequest {
            username: Some("valid-name".to_owned()),
        })),
    )
    .await;
    assert!(matches!(result, Err(AppError::Forbidden(_))));

    let oauth = oauth_start(State(state.clone()), Path("unknown".to_owned())).await;
    assert!(matches!(oauth, Err(AppError::NotFound(_))));
    let unconfigured = oauth_start(State(state), Path("github".to_owned())).await;
    assert!(matches!(unconfigured, Err(AppError::Unavailable(_))));
}

#[tokio::test]
async fn registration_and_email_verification_complete_without_external_delivery() {
    let state = super::super::test_support::state().await;
    let (status, _, Json(registered)) = register(
        State(state.clone()),
        origin_headers(),
        peer(),
        Ok(Json(RegistrationRequest {
            email: "  New.User@Example.COM ".to_owned(),
            password: "correct horse battery staple".to_owned(),
            username: Some("new-user".to_owned()),
        })),
    )
    .await
    .unwrap();
    assert_eq!(status, StatusCode::ACCEPTED);
    let activation_url = registered.activation_url.unwrap();
    let token = reqwest::Url::parse(&activation_url)
        .unwrap()
        .query_pairs()
        .find_map(|(key, value)| (key == "token").then(|| value.into_owned()))
        .unwrap();

    let response = email_verification_verify(State(state.clone()), Query(TokenQuery { token }))
        .await
        .unwrap();
    assert!(
        response.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/login?activated=1")
    );
    let (email, username, verified) = sqlx::query_as::<_, (String, Option<String>, Option<i64>)>(
        "SELECT email, username, email_verified_at FROM users",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(email, "new.user@example.com");
    assert_eq!(username.as_deref(), Some("new-user"));
    assert!(verified.is_some());

    let (_, _, Json(duplicate)) = register(
        State(state.clone()),
        origin_headers(),
        peer(),
        Ok(Json(RegistrationRequest {
            email,
            password: "another secure password".to_owned(),
            username: None,
        })),
    )
    .await
    .unwrap();
    assert!(duplicate.accepted);
    assert!(duplicate.activation_url.is_none());
    assert!(matches!(
        register(
            State(state),
            origin_headers(),
            peer(),
            Ok(Json(RegistrationRequest {
                email: "bad-address".to_owned(),
                password: "another secure password".to_owned(),
                username: None,
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn registration_surfaces_username_conflicts_and_rate_limits_repeated_email_requests() {
    let state = super::super::test_support::state().await;
    crate::auth::register_with_password_and_username(
        &state.db,
        "owner@example.com",
        "correct horse battery staple",
        Some("reserved-name"),
        now_millis(),
    )
    .await
    .unwrap();
    assert!(matches!(
        register(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(RegistrationRequest {
                email: "new@example.com".to_owned(),
                password: "correct horse battery staple".to_owned(),
                username: Some("reserved-name".to_owned()),
            }))
        )
        .await,
        Err(AppError::Conflict(value)) if value == "USERNAME_TAKEN"
    ));

    for attempt in 0..4 {
        let result = email_verification(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(EmailRequest {
                email: "unknown@example.com".to_owned(),
            })),
        )
        .await;
        assert_eq!(result.is_ok(), attempt < 3);
        if attempt == 3 {
            assert!(matches!(result, Err(AppError::TooManyRequests { .. })));
        }
    }
}

#[tokio::test]
async fn password_login_token_me_username_and_logout_flow() {
    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password_and_username(
        &state.db,
        "user@example.com",
        "correct horse battery staple",
        Some("first-name"),
        now_millis(),
    )
    .await
    .unwrap();
    let credentials = || PasswordCredentialsRequest {
        email: "USER@example.com".to_owned(),
        password: "correct horse battery staple".to_owned(),
    };
    let previous_session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    let mut login_request_headers = origin_headers();
    login_request_headers.insert(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_session={previous_session}")).unwrap(),
    );
    let (login_headers, Json(logged_in)) = password_login(
        State(state.clone()),
        login_request_headers,
        peer(),
        Ok(Json(credentials())),
    )
    .await
    .unwrap();
    assert_eq!(logged_in.user.id, user.id);
    assert!(
        crate::auth::user_for_session(&state.db, Some(&previous_session), now_millis())
            .await
            .unwrap()
            .is_none()
    );
    let session_cookie = login_headers
        .get_all(header::SET_COOKIE)
        .iter()
        .find_map(|value| {
            value
                .to_str()
                .unwrap()
                .strip_prefix("aaidle_session=")
                .and_then(|value| value.split(';').next())
        })
        .unwrap()
        .to_owned();
    let headers = authenticated_headers(&session_cookie, None);
    let (me_headers, Json(me_response)) = me(State(state.clone()), headers.clone()).await.unwrap();
    assert_eq!(me_response.user.unwrap().email, "user@example.com");
    assert!(me_headers.get(header::SET_COOKIE).is_none());

    let Json(updated) = update_username(
        State(state.clone()),
        headers.clone(),
        Ok(Json(UsernameUpdateRequest {
            username: Some("second-name".to_owned()),
        })),
    )
    .await
    .unwrap();
    assert_eq!(updated.user.username.as_deref(), Some("second-name"));
    sqlx::query(
        "INSERT INTO users (id, email, email_normalized, username, created_at, updated_at) VALUES ('other-user', 'other@example.com', 'other@example.com', 'taken-name', 1, 1)",
    )
    .execute(&state.db)
    .await
    .unwrap();
    for (username, expected_conflict) in [("?", false), ("taken-name", true)] {
        let result = update_username(
            State(state.clone()),
            headers.clone(),
            Ok(Json(UsernameUpdateRequest {
                username: Some(username.to_owned()),
            })),
        )
        .await;
        assert!(if expected_conflict {
            matches!(result, Err(AppError::Conflict(value)) if value == "USERNAME_TAKEN")
        } else {
            matches!(result, Err(AppError::Validation(_)))
        });
    }

    let (_, Json(token)) = api_token(
        State(state.clone()),
        HeaderMap::new(),
        peer(),
        Ok(Json(credentials())),
    )
    .await
    .unwrap();
    assert_eq!(token.token_type, "Bearer");
    assert!(!token.access_token.is_empty());

    let (logout_headers, status) = logout(State(state.clone()), headers).await.unwrap();
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(logout_headers.get_all(header::SET_COOKIE).iter().count(), 2);
    assert!(
        crate::auth::user_for_session(&state.db, Some(&session_cookie), now_millis())
            .await
            .unwrap()
            .is_none()
    );

    sqlx::query("UPDATE users SET disabled_at = 1 WHERE id = ?")
        .bind(user.id)
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        api_token(
            State(state),
            HeaderMap::new(),
            ConnectInfo("127.0.0.2:43210".parse().unwrap()),
            Ok(Json(credentials()))
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
}

#[tokio::test]
async fn password_login_delays_and_rejects_incorrect_credentials() {
    let state = super::super::test_support::state().await;
    crate::auth::register_with_password(
        &state.db,
        "login@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    assert!(matches!(
        password_login(
            State(state),
            origin_headers(),
            peer(),
            Ok(Json(PasswordCredentialsRequest {
                email: "login@example.com".to_owned(),
                password: "incorrect password".to_owned(),
            }))
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn password_reset_rejects_missing_token_then_rotates_password_and_sessions() {
    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "reset@example.com",
        "old password is long enough",
        now_millis(),
    )
    .await
    .unwrap();
    let old_session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    let (status, _, Json(requested)) = password_reset(
        State(state.clone()),
        origin_headers(),
        peer(),
        Ok(Json(EmailRequest {
            email: "reset@example.com".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert_eq!(status, StatusCode::ACCEPTED);
    assert!(requested.accepted);
    assert!(matches!(
        password_reset_complete(
            State(state.clone()),
            origin_headers(),
            Ok(Json(PasswordResetCompletionRequest {
                password: "new password is long enough".to_owned(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let (_, token) =
        crate::auth::create_password_reset_token(&state.db, "reset@example.com", now_millis())
            .await
            .unwrap()
            .unwrap();
    let mut headers = origin_headers();
    headers.insert(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_password_reset={token}")).unwrap(),
    );
    let response = password_reset_complete(
        State(state.clone()),
        headers,
        Ok(Json(PasswordResetCompletionRequest {
            password: "new password is long enough".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .count(),
        3
    );
    assert!(
        crate::auth::user_for_session(&state.db, Some(&old_session), now_millis())
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        crate::auth::verify_password_credentials(
            &state.db,
            "reset@example.com",
            "new password is long enough"
        )
        .await
        .is_ok()
    );
}

#[tokio::test]
async fn email_requests_are_enumeration_safe_and_return_local_activation_links() {
    let state = super::super::test_support::state().await;
    crate::auth::register_with_password(
        &state.db,
        "verify@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let (_, _, Json(existing)) = email_verification(
        State(state.clone()),
        origin_headers(),
        peer(),
        Ok(Json(EmailRequest {
            email: "verify@example.com".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert!(existing.activation_url.is_some());
    let (_, _, Json(missing)) = email_verification(
        State(state.clone()),
        origin_headers(),
        ConnectInfo("127.0.0.2:43210".parse().unwrap()),
        Ok(Json(EmailRequest {
            email: "missing@example.com".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert!(missing.accepted);
    assert!(missing.activation_url.is_none());

    let (status, _, Json(reset)) = password_reset(
        State(state),
        origin_headers(),
        peer(),
        Ok(Json(EmailRequest {
            email: "missing@example.com".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert_eq!(status, StatusCode::ACCEPTED);
    assert!(reset.accepted);
}

#[tokio::test]
async fn token_and_password_handlers_cover_invalid_credentials_and_consumed_tokens() {
    let state = super::super::test_support::state().await;
    crate::auth::register_with_password(
        &state.db,
        "edge@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    assert!(matches!(
        api_token(
            State(state.clone()),
            HeaderMap::new(),
            peer(),
            Ok(Json(PasswordCredentialsRequest {
                email: "edge@example.com".to_owned(),
                password: String::new(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        password_login(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(PasswordCredentialsRequest {
                email: "edge@example.com".to_owned(),
                password: String::new(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let token = crate::auth::create_email_verification_token(
        &state.db,
        &sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE email = 'edge@example.com'")
            .fetch_one(&state.db)
            .await
            .unwrap(),
        now_millis(),
    )
    .await
    .unwrap();
    let first = email_verification_verify(
        State(state.clone()),
        Query(TokenQuery {
            token: token.clone(),
        }),
    )
    .await
    .unwrap();
    assert!(
        first.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("activated=1")
    );
    let consumed = email_verification_verify(State(state.clone()), Query(TokenQuery { token }))
        .await
        .unwrap();
    assert!(
        consumed.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("error=activation")
    );
    let (_, _, Json(verified_request)) = email_verification(
        State(state.clone()),
        origin_headers(),
        peer(),
        Ok(Json(EmailRequest {
            email: "edge@example.com".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert!(verified_request.activation_url.is_none());

    let (_, reset_token) =
        crate::auth::create_password_reset_token(&state.db, "edge@example.com", now_millis())
            .await
            .unwrap()
            .unwrap();
    let mut short_password_headers = origin_headers();
    short_password_headers.insert(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_password_reset={reset_token}")).unwrap(),
    );
    assert!(matches!(
        password_reset_complete(
            State(state.clone()),
            short_password_headers,
            Ok(Json(PasswordResetCompletionRequest {
                password: "short".to_owned(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let mut bad_reset_headers = origin_headers();
    bad_reset_headers.insert(
        header::COOKIE,
        HeaderValue::from_static("aaidle_password_reset=valid_but_unknown"),
    );
    assert!(matches!(
        password_reset_complete(
            State(state),
            bad_reset_headers,
            Ok(Json(PasswordResetCompletionRequest {
                password: "replacement password".to_owned(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn me_and_hardcore_status_cover_session_cookie_and_disabled_user_paths() {
    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "progress@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    let headers = HeaderMap::from_iter([(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_session={session}")).unwrap(),
    )]);
    let (response_headers, Json(response)) =
        me(State(state.clone()), headers.clone()).await.unwrap();
    assert_eq!(response.user.unwrap().id, user.id);
    assert_eq!(
        response_headers.get_all(header::SET_COOKIE).iter().count(),
        1
    );

    for category in ["llm", "cv"] {
        sqlx::query(
            "INSERT INTO user_game_progress (user_id, game_type, difficulty, category, completed_at) VALUES (?, 'classic', 'challenge', ?, 1)",
        )
        .bind(&user.id)
        .bind(category)
        .execute(&state.db)
        .await
        .unwrap();
    }
    sqlx::query("INSERT INTO user_hardcore_access (user_id, unlocked_at) VALUES (?, 1)")
        .bind(&user.id)
        .execute(&state.db)
        .await
        .unwrap();
    let (_, Json(status)) = hardcore_status(State(state.clone()), headers.clone())
        .await
        .unwrap();
    assert!(status.signed_in);
    assert!(status.unlocked);
    assert_eq!(status.completed_categories, ["cv", "llm"]);

    sqlx::query("UPDATE users SET disabled_at = 1 WHERE id = ?")
        .bind(user.id)
        .execute(&state.db)
        .await
        .unwrap();
    let (_, Json(disabled)) = hardcore_status(State(state), headers).await.unwrap();
    assert!(!disabled.signed_in);
    assert!(!disabled.unlocked);
}

#[tokio::test]
async fn oauth_start_callback_and_success_redirect_cover_local_edge_paths() {
    let mut state = super::super::test_support::state().await;
    let config = std::sync::Arc::get_mut(&mut state.config).unwrap();
    config.github_oauth = Some(OAuthClientConfig {
        client_id: "github-client".to_owned(),
        client_secret: "github-secret".to_owned(),
    });
    config.google_oauth = Some(OAuthClientConfig {
        client_id: "google-client".to_owned(),
        client_secret: "google-secret".to_owned(),
    });

    for (provider, expected_host) in [("github", "github.com"), ("google", "accounts.google.com")] {
        let response = oauth_start(State(state.clone()), Path(provider.to_owned()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FOUND);
        let location =
            reqwest::Url::parse(response.headers()[header::LOCATION].to_str().unwrap()).unwrap();
        assert_eq!(location.host_str(), Some(expected_host));
        assert!(location.query_pairs().any(|(key, _)| key == "state"));
    }

    let unknown = oauth_callback(
        State(state.clone()),
        Path("unknown".to_owned()),
        HeaderMap::new(),
        Query(OAuthCallbackQuery {
            state: "state".to_owned(),
            code: "code".to_owned(),
        }),
    )
    .await
    .unwrap();
    assert!(
        unknown.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/login?error=oauth")
    );

    let missing_cookie = oauth_callback(
        State(state.clone()),
        Path("github".to_owned()),
        HeaderMap::new(),
        Query(OAuthCallbackQuery {
            state: "state".to_owned(),
            code: "code".to_owned(),
        }),
    )
    .await
    .unwrap();
    assert!(
        missing_cookie.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/login?error=oauth")
    );

    let (oauth_state, cookie) = crate::auth::create_oauth_state(
        &state.config.auth_secret,
        crate::auth::OAuthProvider::Github,
    )
    .unwrap();
    let valid_headers = HeaderMap::from_iter([(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_oauth_state={cookie}")).unwrap(),
    )]);
    let invalid_code = oauth_callback(
        State(state.clone()),
        Path("github".to_owned()),
        valid_headers,
        Query(OAuthCallbackQuery {
            state: oauth_state,
            code: String::new(),
        }),
    )
    .await
    .unwrap();
    assert!(
        invalid_code.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/login?error=oauth")
    );

    for path in ["/classic", "/account-disabled"] {
        let response = oauth_success_redirect(&state, "session-token".to_owned(), path).unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert!(
            response.headers()[header::LOCATION]
                .to_str()
                .unwrap()
                .ends_with(path)
        );
        assert_eq!(
            response
                .headers()
                .get_all(header::SET_COOKIE)
                .iter()
                .count(),
            3
        );
    }
}

#[tokio::test]
async fn production_reserved_registration_is_accepted_without_creating_an_account() {
    let mut state = super::super::test_support::state().await;
    std::sync::Arc::get_mut(&mut state.config)
        .unwrap()
        .environment = AppEnvironment::Production;
    let (_, _, Json(response)) = register(
        State(state.clone()),
        origin_headers(),
        peer(),
        Ok(Json(RegistrationRequest {
            email: "ADMIN@AAIDLE.COM".to_owned(),
            password: "correct horse battery staple".to_owned(),
            username: None,
        })),
    )
    .await
    .unwrap();
    assert!(response.accepted);
    assert!(response.activation_url.is_none());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
            .fetch_one(&state.db)
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn account_deletion_requires_recent_matching_authorization_and_deletes_account() {
    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "delete.me@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    let request_headers = authenticated_headers(&session, None);
    let (request_status, _, Json(requested)) =
        account_deletion(State(state.clone()), request_headers, peer())
            .await
            .unwrap();
    assert_eq!(request_status, StatusCode::ACCEPTED);
    assert!(requested.accepted);
    let token = crate::auth::create_account_deletion_token(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    let headers =
        authenticated_headers(&session, Some(("aaidle_account_deletion", token.as_str())));
    let (_, Json(status)) = account_deletion_status(State(state.clone()), headers.clone())
        .await
        .unwrap();
    assert!(status.authorized);
    assert_eq!(status.masked_email.as_deref(), Some("d***@example.com"));
    assert!(status.expires_at.is_some());

    assert!(matches!(
        account_deletion_complete(
            State(state.clone()),
            headers.clone(),
            Ok(Json(AccountDeletionCompletionRequest {
                confirmation: "DELETE wrong@example.com".to_owned(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));
    let response = account_deletion_complete(
        State(state.clone()),
        headers,
        Ok(Json(AccountDeletionCompletionRequest {
            confirmation: "DELETE d***@example.com".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .count(),
        3
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE id = ?")
            .bind(user.id)
            .fetch_one(&state.db)
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn account_deletion_rejects_stale_missing_and_mismatched_authorization() {
    let state = super::super::test_support::state().await;
    let first = crate::auth::register_with_password(
        &state.db,
        "first@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let second = crate::auth::register_with_password(
        &state.db,
        "second@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &first.id, now_millis())
        .await
        .unwrap();
    let headers = authenticated_headers(&session, None);
    assert!(matches!(
        account_deletion_complete(
            State(state.clone()),
            headers.clone(),
            Ok(Json(AccountDeletionCompletionRequest {
                confirmation: "DELETE f***@example.com".to_owned(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let other_token =
        crate::auth::create_account_deletion_token(&state.db, &second.id, now_millis())
            .await
            .unwrap();
    let mismatched = authenticated_headers(
        &session,
        Some(("aaidle_account_deletion", other_token.as_str())),
    );
    let (_, Json(status)) = account_deletion_status(State(state.clone()), mismatched.clone())
        .await
        .unwrap();
    assert!(!status.authorized);
    assert!(matches!(
        account_deletion_complete(
            State(state.clone()),
            mismatched,
            Ok(Json(AccountDeletionCompletionRequest {
                confirmation: "DELETE f***@example.com".to_owned(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));

    sqlx::query("UPDATE user_sessions SET created_at = ?")
        .bind(now_millis() - 31 * 60 * 1_000)
        .execute(&state.db)
        .await
        .unwrap();
    let stale = authenticated_headers(&session, None);
    assert!(matches!(
        account_deletion(State(state.clone()), stale.clone(), peer()).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        account_deletion_complete(
            State(state.clone()),
            stale.clone(),
            Ok(Json(AccountDeletionCompletionRequest {
                confirmation: "DELETE f***@example.com".to_owned(),
            }))
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    let (_, Json(status)) = account_deletion_status(State(state.clone()), stale.clone())
        .await
        .unwrap();
    assert!(!status.authorized);

    sqlx::query("UPDATE users SET disabled_at = 1 WHERE id = ?")
        .bind(&first.id)
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        account_deletion_complete(
            State(state.clone()),
            stale.clone(),
            Ok(Json(AccountDeletionCompletionRequest {
                confirmation: "DELETE f***@example.com".to_owned(),
            }))
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
    let (_, Json(disabled_status)) = account_deletion_status(State(state), stale).await.unwrap();
    assert!(!disabled_status.authorized);
}

#[tokio::test]
async fn malformed_auth_json_is_rejected_at_every_auth_payload_boundary() {
    let state = super::super::test_support::state().await;
    for uri in [
        "/auth/register",
        "/auth/username",
        "/auth/password",
        "/auth/token",
        "/auth/password-reset",
        "/auth/password-reset/complete",
        "/auth/email-verification",
        "/auth/account-deletion/complete",
    ] {
        let request = if uri == "/auth/username" {
            Request::put(uri)
        } else {
            Request::post(uri)
        };
        let mut request = request
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ORIGIN, "http://localhost:3000")
            .header(header::COOKIE, "aaidle_csrf=test-csrf")
            .header("x-aaidle-csrf-token", "test-csrf")
            .body(Body::from("{"))
            .unwrap();
        request.extensions_mut().insert(ConnectInfo(
            "127.0.0.10:43210".parse::<SocketAddr>().unwrap(),
        ));
        let response = super::super::router(state.clone())
            .oneshot(request)
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{uri}");
    }
}

#[tokio::test]
async fn auth_handlers_surface_database_trigger_failures() {
    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "trigger@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    sqlx::query(
        "CREATE TRIGGER reject_username_update BEFORE UPDATE OF username ON users BEGIN SELECT RAISE(ABORT, 'forced username failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        update_username(
            State(state),
            authenticated_headers(&session, None),
            Ok(Json(UsernameUpdateRequest {
                username: Some("new-trigger-name".to_owned()),
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    sqlx::query(
        "CREATE TRIGGER reject_auth_token BEFORE INSERT ON auth_email_tokens BEGIN SELECT RAISE(ABORT, 'forced token failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        register(
            State(state),
            origin_headers(),
            peer(),
            Ok(Json(RegistrationRequest {
                email: "token-trigger@example.com".to_owned(),
                password: "correct horse battery staple".to_owned(),
                username: None,
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    crate::auth::register_with_password(
        &state.db,
        "session-trigger@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    sqlx::query(
        "CREATE TRIGGER reject_session BEFORE INSERT ON user_sessions BEGIN SELECT RAISE(ABORT, 'forced session failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        password_login(
            State(state),
            origin_headers(),
            peer(),
            Ok(Json(PasswordCredentialsRequest {
                email: "session-trigger@example.com".to_owned(),
                password: "correct horse battery staple".to_owned(),
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn configured_email_transport_failures_propagate_from_auth_handlers() {
    let mut state = super::super::test_support::state().await;
    {
        let config = std::sync::Arc::get_mut(&mut state.config).unwrap();
        config.secure_cookies = true;
        config.resend_api_key = Some("configured-test-key".to_owned());
    }
    state.http = reqwest::Client::builder()
        .proxy(Proxy::all("http://127.0.0.1:0").unwrap())
        .build()
        .unwrap();

    assert!(matches!(
        register(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(RegistrationRequest {
                email: "register-delivery@example.com".to_owned(),
                password: "correct horse battery staple".to_owned(),
                username: None,
            })),
        )
        .await,
        Err(AppError::Unavailable(_))
    ));

    let user = crate::auth::register_with_password(
        &state.db,
        "delivery@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    assert!(matches!(
        email_verification(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(EmailRequest {
                email: user.email.clone(),
            })),
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        password_reset(
            State(state.clone()),
            origin_headers(),
            ConnectInfo("127.0.0.11:43210".parse().unwrap()),
            Ok(Json(EmailRequest {
                email: user.email.clone(),
            })),
        )
        .await,
        Err(AppError::Unavailable(_))
    ));

    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    assert!(matches!(
        account_deletion(
            State(state),
            authenticated_headers(&session, None),
            ConnectInfo("127.0.0.12:43210".parse().unwrap()),
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn invalid_deletion_link_and_closed_pool_errors_reach_auth_responses() {
    let state = super::super::test_support::state().await;
    let invalid = account_deletion_verify(
        State(state.clone()),
        Query(TokenQuery {
            token: "bad token".to_owned(),
        }),
    )
    .await
    .unwrap();
    assert!(
        invalid.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/profile?deletion=invalid")
    );

    state.db.close().await;
    assert!(matches!(
        email_verification_verify(
            State(state.clone()),
            Query(TokenQuery {
                token: "valid_token-closed".to_owned(),
            }),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        password_reset_complete(
            State(state.clone()),
            HeaderMap::from_iter([
                (
                    header::ORIGIN,
                    HeaderValue::from_static("http://localhost:3000"),
                ),
                (
                    header::COOKIE,
                    HeaderValue::from_static("aaidle_password_reset=valid_token-closed"),
                ),
            ]),
            Ok(Json(PasswordResetCompletionRequest {
                password: "replacement password".to_owned(),
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
    let session_headers = HeaderMap::from_iter([(
        header::COOKIE,
        HeaderValue::from_static("aaidle_session=valid_token-closed"),
    )]);
    assert!(matches!(
        account_deletion_status(State(state.clone()), session_headers.clone()).await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        me(State(state), session_headers).await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn csrf_and_email_validation_fail_before_authentication_or_database_work() {
    let state = super::super::test_support::state().await;
    let origin_only = origin_headers();

    assert!(matches!(
        update_username(
            State(state.clone()),
            origin_only.clone(),
            Ok(Json(UsernameUpdateRequest {
                username: Some("valid-name".to_owned()),
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        account_deletion(State(state.clone()), origin_only.clone(), peer()).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        account_deletion_complete(
            State(state.clone()),
            origin_only.clone(),
            Ok(Json(AccountDeletionCompletionRequest {
                confirmation: "DELETE a***@example.com".to_owned(),
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        logout(State(state.clone()), origin_only.clone()).await,
        Err(AppError::Forbidden(_))
    ));

    let invalid_credentials = || PasswordCredentialsRequest {
        email: "not-an-email".to_owned(),
        password: "correct horse battery staple".to_owned(),
    };
    assert!(matches!(
        password_login(
            State(state.clone()),
            origin_only.clone(),
            peer(),
            Ok(Json(invalid_credentials())),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        api_token(
            State(state.clone()),
            HeaderMap::new(),
            peer(),
            Ok(Json(invalid_credentials())),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        email_verification(
            State(state.clone()),
            origin_only.clone(),
            peer(),
            Ok(Json(EmailRequest {
                email: "not-an-email".to_owned(),
            })),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        password_reset(
            State(state),
            origin_only,
            peer(),
            Ok(Json(EmailRequest {
                email: "not-an-email".to_owned(),
            })),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn auth_rate_limit_database_errors_propagate_from_each_password_and_email_entrypoint() {
    let state = super::super::test_support::state().await;
    state.db.close().await;

    assert!(matches!(
        register(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(RegistrationRequest {
                email: "register-closed@example.com".to_owned(),
                password: "correct horse battery staple".to_owned(),
                username: None,
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
    for result in [
        password_login(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(PasswordCredentialsRequest {
                email: "login-closed@example.com".to_owned(),
                password: "correct horse battery staple".to_owned(),
            })),
        )
        .await
        .map(|_| ()),
        api_token(
            State(state.clone()),
            HeaderMap::new(),
            peer(),
            Ok(Json(PasswordCredentialsRequest {
                email: "token-closed@example.com".to_owned(),
                password: "correct horse battery staple".to_owned(),
            })),
        )
        .await
        .map(|_| ()),
        email_verification(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(EmailRequest {
                email: "verification-closed@example.com".to_owned(),
            })),
        )
        .await
        .map(|_| ()),
        password_reset(
            State(state),
            origin_headers(),
            peer(),
            Ok(Json(EmailRequest {
                email: "reset-closed@example.com".to_owned(),
            })),
        )
        .await
        .map(|_| ()),
    ] {
        assert!(matches!(result, Err(AppError::Database(_))));
    }
}

#[tokio::test]
async fn token_creation_failures_propagate_from_verification_reset_and_deletion_requests() {
    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "token-failures@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    sqlx::query(
        "CREATE TRIGGER reject_requested_auth_tokens BEFORE INSERT ON auth_email_tokens BEGIN SELECT RAISE(ABORT, 'forced requested token failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();

    assert!(matches!(
        email_verification(
            State(state.clone()),
            origin_headers(),
            peer(),
            Ok(Json(EmailRequest {
                email: user.email.clone(),
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        password_reset(
            State(state.clone()),
            origin_headers(),
            ConnectInfo("127.0.0.2:43210".parse().unwrap()),
            Ok(Json(EmailRequest {
                email: user.email.clone(),
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        account_deletion(
            State(state),
            authenticated_headers(&session, None),
            ConnectInfo("127.0.0.3:43210".parse().unwrap()),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn deletion_status_completion_logout_and_hardcore_queries_propagate_deep_database_errors() {
    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "status-db-error@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    let token = crate::auth::create_account_deletion_token(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    sqlx::query("DROP TABLE auth_email_tokens")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        account_deletion_status(
            State(state),
            authenticated_headers(&session, Some(("aaidle_account_deletion", &token))),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "delete-db-error@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    let token = crate::auth::create_account_deletion_token(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    sqlx::query(
        "CREATE TRIGGER reject_account_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'forced account deletion failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        account_deletion_complete(
            State(state),
            authenticated_headers(&session, Some(("aaidle_account_deletion", &token))),
            Ok(Json(AccountDeletionCompletionRequest {
                confirmation: "DELETE d***@example.com".to_owned(),
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "logout-db-error@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    sqlx::query(
        "CREATE TRIGGER reject_session_delete BEFORE DELETE ON user_sessions BEGIN SELECT RAISE(ABORT, 'forced session deletion failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        logout(State(state), authenticated_headers(&session, None)).await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "progress-db-error@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    sqlx::query("DROP TABLE user_game_progress")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        hardcore_status(
            State(state),
            HeaderMap::from_iter([(
                header::COOKIE,
                HeaderValue::from_str(&format!("aaidle_session={session}")).unwrap(),
            )]),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let user = crate::auth::register_with_password(
        &state.db,
        "unlock-db-error@example.com",
        "correct horse battery staple",
        now_millis(),
    )
    .await
    .unwrap();
    let session = crate::auth::create_session(&state.db, &user.id, now_millis())
        .await
        .unwrap();
    sqlx::query("DROP TABLE user_hardcore_access")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        hardcore_status(
            State(state),
            HeaderMap::from_iter([(
                header::COOKIE,
                HeaderValue::from_str(&format!("aaidle_session={session}")).unwrap(),
            )]),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn auth_cookie_and_redirect_header_encoding_failures_are_reported() {
    let mut state = super::super::test_support::state().await;
    std::sync::Arc::get_mut(&mut state.config)
        .unwrap()
        .app_origin = "http://localhost:3000\ninvalid".to_owned();
    assert!(matches!(
        oauth_success_redirect(&state, "session".to_owned(), "/classic"),
        Err(AppError::Validation(_))
    ));

    let state = super::super::test_support::state().await;
    assert!(matches!(
        oauth_success_redirect(&state, "invalid\nsession".to_owned(), "/classic"),
        Err(AppError::Config(_))
    ));
}

#[tokio::test]
async fn oauth_session_establishment_creates_rotates_and_reports_database_failures() {
    let state = super::super::test_support::state().await;
    let identity = || crate::auth::OAuthIdentity {
        provider_user_id: "oauth-provider-user".to_owned(),
        email: "oauth-session@example.com".to_owned(),
        display_name: Some("OAuth User".to_owned()),
    };
    let (session, disabled) = establish_oauth_session(
        &state,
        crate::auth::OAuthProvider::Github,
        identity(),
        &HeaderMap::new(),
    )
    .await
    .unwrap();
    assert!(!session.is_empty());
    assert!(!disabled);

    let user_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM users WHERE email_normalized = 'oauth-session@example.com'",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();
    let previous = crate::auth::create_session(&state.db, &user_id, now_millis())
        .await
        .unwrap();
    sqlx::query("UPDATE users SET disabled_at = 1 WHERE id = ?")
        .bind(&user_id)
        .execute(&state.db)
        .await
        .unwrap();
    let headers = HeaderMap::from_iter([(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_session={previous}")).unwrap(),
    )]);
    let (_, disabled) = establish_oauth_session(
        &state,
        crate::auth::OAuthProvider::Github,
        identity(),
        &headers,
    )
    .await
    .unwrap();
    assert!(disabled);
    assert!(
        crate::auth::user_for_session(&state.db, Some(&previous), now_millis())
            .await
            .unwrap()
            .is_none()
    );

    let normal = finish_oauth_callback(
        &state,
        crate::auth::OAuthProvider::Google,
        &HeaderMap::new(),
        Ok(crate::auth::OAuthIdentity {
            provider_user_id: "finish-google-user".to_owned(),
            email: "finish-google@example.com".to_owned(),
            display_name: None,
        }),
    )
    .await
    .unwrap();
    assert!(
        normal.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/classic")
    );
    let disabled = finish_oauth_callback(
        &state,
        crate::auth::OAuthProvider::Github,
        &HeaderMap::new(),
        Ok(identity()),
    )
    .await
    .unwrap();
    assert!(
        disabled.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/account-disabled")
    );
    let failure = finish_oauth_callback(
        &state,
        crate::auth::OAuthProvider::Github,
        &HeaderMap::new(),
        Err(AppError::validation("OAuth failure")),
    )
    .await
    .unwrap();
    assert!(
        failure.headers()[header::LOCATION]
            .to_str()
            .unwrap()
            .ends_with("/login?error=oauth")
    );

    sqlx::query(
        "CREATE TRIGGER reject_oauth_session BEFORE INSERT ON user_sessions BEGIN SELECT RAISE(ABORT, 'forced session failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        establish_oauth_session(
            &state,
            crate::auth::OAuthProvider::Google,
            crate::auth::OAuthIdentity {
                provider_user_id: "google-provider-user".to_owned(),
                email: "google-session@example.com".to_owned(),
                display_name: None,
            },
            &HeaderMap::new(),
        )
        .await,
        Err(AppError::Database(_))
    ));
}
