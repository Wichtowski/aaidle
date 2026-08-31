use super::*;

use axum::{
    body::Body,
    http::{HeaderValue, Request, header},
};
use tower::ServiceExt;

use crate::dto::AdminAssignablePermission;

async fn admin_state(permission: &str) -> (AppState, HeaderMap, String, String) {
    let state = super::super::test_support::state().await;
    let admin_id = uuid::Uuid::new_v4().to_string();
    let target_id = uuid::Uuid::new_v4().to_string();
    for (id, email, user_permission) in [
        (&admin_id, "admin@example.com", permission),
        (&target_id, "target@example.com", "user"),
    ] {
        sqlx::query(
            "INSERT INTO users (id, email, email_normalized, display_name, email_verified_at, permission, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, 1, 1)",
        )
        .bind(id)
        .bind(email)
        .bind(email)
        .bind(if id == &target_id { Some("Target User") } else { None })
        .bind(user_permission)
        .execute(&state.db)
        .await
        .unwrap();
    }
    let session = crate::auth::create_session(&state.db, &admin_id, now_millis())
        .await
        .unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_session={session}; aaidle_csrf=test-csrf")).unwrap(),
    );
    headers.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    headers.insert("x-aaidle-csrf-token", HeaderValue::from_static("test-csrf"));
    (state, headers, admin_id, target_id)
}

async fn seed_classic_history(state: &AppState, user_id: &str) -> (String, String, String) {
    sqlx::query(
        "INSERT INTO providers (id, name, slug, created_at, updated_at) VALUES ('provider', 'Provider', 'provider', 1, 1)",
    )
    .execute(&state.db)
    .await
    .unwrap();
    let player_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO anonymous_players (id, created_at, last_seen_at) VALUES (?, 1, 1)")
        .bind(&player_id)
        .execute(&state.db)
        .await
        .unwrap();
    let categories = ["llm", "cv", "nlp", "od", "classical-ml", "filters"];
    let mut target_challenge = String::new();
    let mut correct_request = String::new();
    for (index, category) in categories.into_iter().enumerate() {
        let model_id = format!("answer-{index}");
        let challenge_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO models (id, provider_id, name, slug, local_execution, reasoning_support, status, verified_at, source_label, created_at, updated_at) VALUES (?, 'provider', ?, ?, 'unknown', 'unknown', 'active', '2025-01-01', 'test', 1, 1)",
        )
        .bind(&model_id)
        .bind(format!("Answer {index}"))
        .bind(format!("answer-{index}"))
        .execute(&state.db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO daily_challenges (id, challenge_date, mode, answer_model_id, selection_version, generated_at, generation_source) VALUES (?, ?, ?, ?, 1, 1, 'test')",
        )
        .bind(&challenge_id)
        .bind(format!("2025-01-{:02}", index + 1))
        .bind(format!("classic:{category}:challenge"))
        .bind(&model_id)
        .execute(&state.db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO user_challenge_completions (user_id, challenge_id, completed_at) VALUES (?, ?, ?)",
        )
        .bind(user_id)
        .bind(&challenge_id)
        .bind(index as i64 + 10)
        .execute(&state.db)
        .await
        .unwrap();
        if index == 0 {
            target_challenge = challenge_id;
            correct_request = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO guess_events (id, request_id, challenge_id, player_id, guessed_model_id, attempt_number, is_correct, comparison_json, created_at, user_id) VALUES (?, ?, ?, ?, ?, 1, 1, '{}', 10, ?)",
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&correct_request)
            .bind(&target_challenge)
            .bind(&player_id)
            .bind(&model_id)
            .bind(user_id)
            .execute(&state.db)
            .await
            .unwrap();
        }
    }
    sqlx::query(
        "INSERT INTO models (id, provider_id, name, slug, local_execution, reasoning_support, status, verified_at, source_label, created_at, updated_at) VALUES ('wrong-model', 'provider', 'Wrong model', 'wrong-model', 'unknown', 'unknown', 'active', '2025-01-01', 'test', 1, 1)",
    )
    .execute(&state.db)
    .await
    .unwrap();
    let wrong_request = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO guess_events (id, request_id, challenge_id, player_id, guessed_model_id, attempt_number, is_correct, comparison_json, created_at, user_id) VALUES (?, ?, ?, ?, 'wrong-model', 2, 0, '{}', 11, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&wrong_request)
    .bind(&target_challenge)
    .bind(&player_id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO challenge_guess_stats (challenge_id, guessed_model_id, total_guess_count, unique_player_count, correct_guess_count, updated_at) VALUES (?, 'wrong-model', 99, 99, 99, 1)",
    )
    .bind(&target_challenge)
    .execute(&state.db)
    .await
    .unwrap();
    sqlx::query("INSERT INTO user_hardcore_access (user_id, unlocked_at) VALUES (?, 1)")
        .bind(user_id)
        .execute(&state.db)
        .await
        .unwrap();
    (correct_request, wrong_request, player_id)
}

#[test]
fn soundtrack_url_requires_a_bounded_public_https_soundcloud_url() {
    assert!(normalize_soundcloud_url("").is_ok_and(|value| value.is_none()));
    assert!(
        normalize_soundcloud_url("  https://soundcloud.com/artist/track  ")
            .is_ok_and(|value| value.as_deref() == Some("https://soundcloud.com/artist/track"))
    );
    assert!(normalize_soundcloud_url("https://m.soundcloud.com/artist/track").is_ok());
    for invalid in [
        "http://soundcloud.com/artist/track",
        "https://soundcloud.example/artist/track",
        "not a URL",
    ] {
        assert!(normalize_soundcloud_url(invalid).is_err());
    }
    assert!(
        normalize_soundcloud_url(&format!("https://soundcloud.com/{}", "a".repeat(2_100))).is_err()
    );
}

#[test]
fn sql_like_search_escapes_all_pattern_metacharacters() {
    assert_eq!(escape_like(r"a%b_c\d"), r"a\%b\_c\\d");
    assert_eq!(escape_like("plain"), "plain");
}

#[test]
fn admin_summary_derives_sign_in_providers_and_permission() {
    let summary = admin_user_summary(AdminUserRow {
        id: "user-id".to_owned(),
        email: "user@example.com".to_owned(),
        display_name: Some("User".to_owned()),
        email_verified_at: Some(1),
        created_at: 2,
        updated_at: 3,
        permission: "developer".to_owned(),
        disabled_at: None,
        disabled_reason: None,
        issue_report_limit: 4,
        issue_report_limit_requested_at: Some(8),
        disabled_by_email: Some("admin@example.com".to_owned()),
        password_hash: Some("hash".to_owned()),
        identity_providers: Some("github,google".to_owned()),
        last_seen_at: Some(5),
        progress_updated_at: Some(6),
        completion_count: 7,
    });
    assert_eq!(summary.id, "user-id");
    assert_eq!(summary.permission, "developer");
    assert_eq!(summary.sign_in_providers, ["password", "github", "google"]);
    assert_eq!(summary.completion_count, 7);
}

#[tokio::test]
async fn admin_operations_reject_anonymous_requests() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        users(
            State(state.clone()),
            HeaderMap::new(),
            Query(AdminUsersQuery {
                page: Some(0),
                query: None,
            }),
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
    assert!(matches!(
        hardcore_soundtrack(State(state), HeaderMap::new()).await,
        Err(AppError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn developer_can_search_users_and_read_full_user_detail() {
    let (state, headers, _, target_id) = admin_state("developer").await;
    sqlx::query(
        "INSERT INTO user_identities (provider, provider_user_id, user_id, created_at) VALUES ('github', 'provider-user', ?, 1)",
    )
    .bind(&target_id)
    .execute(&state.db)
    .await
    .unwrap();

    let Json(response) = users(
        State(state.clone()),
        headers.clone(),
        Query(AdminUsersQuery {
            page: None,
            query: Some("target@example".to_owned()),
        }),
    )
    .await
    .unwrap();
    assert_eq!(response.total, 1);
    assert_eq!(response.users[0].id, target_id);
    assert_eq!(response.users[0].sign_in_providers, ["github"]);

    let Json(detail) = user_detail(State(state), headers, Path(target_id.clone()))
        .await
        .unwrap();
    assert_eq!(detail.user.user.id, target_id);
    assert!(detail.user.completions.is_empty());
    assert!(!detail.user.hardcore_unlocked);
}

#[tokio::test]
async fn admin_reads_enforce_permissions_and_query_validation() {
    let (state, headers, _, _) = admin_state("user").await;
    assert!(matches!(
        users(
            State(state),
            headers,
            Query(AdminUsersQuery {
                page: None,
                query: None
            })
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    let (state, headers, _, _) = admin_state("developer").await;
    for query in [
        AdminUsersQuery {
            page: Some(0),
            query: None,
        },
        AdminUsersQuery {
            page: Some(1),
            query: Some("x".repeat(101)),
        },
    ] {
        assert!(matches!(
            users(State(state.clone()), headers.clone(), Query(query)).await,
            Err(AppError::Validation(_))
        ));
    }
    assert!(matches!(
        user_detail(State(state), headers, Path("missing".to_owned())).await,
        Err(AppError::NotFound(_))
    ));
}

#[tokio::test]
async fn superadmin_updates_accounts_and_invalidates_active_sessions() {
    let (state, headers, _, target_id) = admin_state("superadmin").await;
    let target_session = crate::auth::create_session(&state.db, &target_id, now_millis())
        .await
        .unwrap();
    sqlx::query("UPDATE users SET issue_report_limit_requested_at = 1 WHERE id = ?")
        .bind(&target_id)
        .execute(&state.db)
        .await
        .unwrap();
    let Json(response) = user_update(
        State(state.clone()),
        headers.clone(),
        Path(target_id.clone()),
        Ok(Json(AdminUserUpdateRequest {
            permission: Some(AdminAssignablePermission::Developer),
            disabled: Some(true),
            disabled_reason: Some(" policy violation ".to_owned()),
            issue_report_limit: Some(0),
        })),
    )
    .await
    .unwrap();
    assert_eq!(response.user.user.permission, "developer");
    assert_eq!(response.user.user.issue_report_limit, 0);
    assert!(response.user.user.issue_report_limit_requested_at.is_none());
    assert_eq!(
        response.user.user.disabled_reason.as_deref(),
        Some("policy violation")
    );
    assert!(
        crate::auth::user_for_session(&state.db, Some(&target_session), now_millis())
            .await
            .unwrap()
            .is_some()
    );

    let _ = user_update(
        State(state.clone()),
        headers,
        Path(target_id.clone()),
        Ok(Json(AdminUserUpdateRequest {
            permission: None,
            disabled: Some(false),
            disabled_reason: None,
            issue_report_limit: None,
        })),
    )
    .await
    .unwrap();
    assert!(
        crate::auth::user_for_session(&state.db, Some(&target_session), now_millis())
            .await
            .unwrap()
            .is_none()
    );
    let disabled_at =
        sqlx::query_scalar::<_, Option<i64>>("SELECT disabled_at FROM users WHERE id = ?")
            .bind(target_id)
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert!(disabled_at.is_none());
}

#[tokio::test]
async fn account_mutations_cover_authorization_and_validation_guards() {
    let (state, headers, _, target_id) = admin_state("developer").await;
    assert!(matches!(
        user_update(
            State(state.clone()),
            headers.clone(),
            Path(target_id.clone()),
            Ok(Json(AdminUserUpdateRequest {
                permission: Some(AdminAssignablePermission::Developer),
                disabled: None,
                disabled_reason: None,
                issue_report_limit: None,
            }))
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    let (state, headers, admin_id, target_id) = admin_state("superadmin").await;
    assert!(matches!(
        user_update(
            State(state.clone()),
            headers.clone(),
            Path(admin_id.clone()),
            Ok(Json(AdminUserUpdateRequest {
                permission: None,
                disabled: Some(false),
                disabled_reason: None,
                issue_report_limit: None,
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));
    for payload in [
        AdminUserUpdateRequest {
            permission: None,
            disabled: None,
            disabled_reason: None,
            issue_report_limit: None,
        },
        AdminUserUpdateRequest {
            permission: None,
            disabled: None,
            disabled_reason: None,
            issue_report_limit: Some(-1),
        },
        AdminUserUpdateRequest {
            permission: None,
            disabled: None,
            disabled_reason: None,
            issue_report_limit: Some(1_001),
        },
        AdminUserUpdateRequest {
            permission: None,
            disabled: Some(true),
            disabled_reason: Some("  ".to_owned()),
            issue_report_limit: None,
        },
        AdminUserUpdateRequest {
            permission: None,
            disabled: Some(true),
            disabled_reason: Some("x".repeat(501)),
            issue_report_limit: None,
        },
    ] {
        assert!(matches!(
            user_update(
                State(state.clone()),
                headers.clone(),
                Path(target_id.clone()),
                Ok(Json(payload))
            )
            .await,
            Err(AppError::Validation(_))
        ));
    }
    assert!(matches!(
        delete_guess(
            State(state),
            headers,
            Path(admin_id),
            Ok(Json(AdminDeleteGuessRequest {
                game_key: "key".to_owned(),
                request_id: uuid::Uuid::new_v4(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn deleting_incorrect_history_rebuilds_stats_and_preserves_completion_access() {
    let (state, headers, _, target_id) = admin_state("superadmin").await;
    let (_, wrong_request, player_id) = seed_classic_history(&state, &target_id).await;

    let Json(detail) = delete_guess(
        State(state.clone()),
        headers,
        Path(target_id.clone()),
        Ok(Json(AdminDeleteGuessRequest {
            game_key: "classic:llm:challenge".to_owned(),
            request_id: uuid::Uuid::parse_str(&wrong_request).unwrap(),
        })),
    )
    .await
    .unwrap();
    assert_eq!(detail.user.completions.len(), 6);
    assert!(detail.user.hardcore_unlocked);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM guess_events WHERE request_id = ?")
            .bind(wrong_request)
            .fetch_one(&state.db)
            .await
            .unwrap(),
        0
    );
    let stats = sqlx::query_as::<_, (i64, i64, i64)>(
        "SELECT total_guess_count, unique_player_count, correct_guess_count FROM challenge_guess_stats",
    )
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(stats, (1, 1, 1));
    let player_stats = sqlx::query_as::<_, (i64, i64)>(
        "SELECT games_played, games_won FROM player_mode_stats WHERE player_id = ? AND mode = 'classic:llm:challenge'",
    )
    .bind(player_id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(player_stats, (1, 1));
}

#[tokio::test]
async fn deleting_only_correct_history_revokes_completion_and_hardcore_access() {
    let (state, headers, _, target_id) = admin_state("superadmin").await;
    let (correct_request, _, _) = seed_classic_history(&state, &target_id).await;

    let Json(detail) = delete_guess(
        State(state.clone()),
        headers,
        Path(target_id.clone()),
        Ok(Json(AdminDeleteGuessRequest {
            game_key: "classic:llm:challenge".to_owned(),
            request_id: uuid::Uuid::parse_str(&correct_request).unwrap(),
        })),
    )
    .await
    .unwrap();
    assert_eq!(detail.user.completions.len(), 5);
    assert!(!detail.user.hardcore_unlocked);
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_game_progress WHERE user_id = ? AND difficulty = 'challenge'",
        )
        .bind(&target_id)
        .fetch_one(&state.db)
        .await
        .unwrap(),
        5
    );
}

#[tokio::test]
async fn delete_history_and_user_updates_cover_missing_and_protected_targets() {
    let (state, headers, _, target_id) = admin_state("superadmin").await;
    for game_key in [String::new(), "x".repeat(301)] {
        assert!(matches!(
            delete_guess(
                State(state.clone()),
                headers.clone(),
                Path(target_id.clone()),
                Ok(Json(AdminDeleteGuessRequest {
                    game_key,
                    request_id: uuid::Uuid::new_v4(),
                }))
            )
            .await,
            Err(AppError::Validation(_))
        ));
    }
    assert!(matches!(
        delete_guess(
            State(state.clone()),
            headers.clone(),
            Path(target_id),
            Ok(Json(AdminDeleteGuessRequest {
                game_key: "classic:key".to_owned(),
                request_id: uuid::Uuid::new_v4(),
            }))
        )
        .await,
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        user_update(
            State(state.clone()),
            headers.clone(),
            Path("missing-user".to_owned()),
            Ok(Json(AdminUserUpdateRequest {
                permission: Some(AdminAssignablePermission::User),
                disabled: None,
                disabled_reason: None,
                issue_report_limit: None,
            }))
        )
        .await,
        Err(AppError::NotFound(_))
    ));
    sqlx::query("UPDATE users SET permission = 'superadmin' WHERE email = 'target@example.com'")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        user_update(
            State(state.clone()),
            headers.clone(),
            Path(
                sqlx::query_scalar::<_, String>(
                    "SELECT id FROM users WHERE email = 'target@example.com'"
                )
                .fetch_one(&state.db)
                .await
                .unwrap()
            ),
            Ok(Json(AdminUserUpdateRequest {
                permission: Some(AdminAssignablePermission::User),
                disabled: None,
                disabled_reason: None,
                issue_report_limit: None,
            }))
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    sqlx::query("UPDATE users SET disabled_at = 1 WHERE email = 'admin@example.com'")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        users(
            State(state),
            headers,
            Query(AdminUsersQuery {
                page: None,
                query: None
            })
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
}

#[tokio::test]
async fn soundtrack_setting_round_trips_and_public_config_filters_bad_values() {
    let (state, headers, _, _) = admin_state("superadmin").await;
    assert!(
        hardcore_soundtrack(State(state.clone()), headers.clone())
            .await
            .unwrap()
            .0
            .url
            .is_empty()
    );
    assert!(matches!(
        update_hardcore_soundtrack(
            State(state.clone()),
            headers.clone(),
            Ok(Json(SoundtrackUpdateRequest {
                url: "x".repeat(2_049),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));
    let Json(updated) = update_hardcore_soundtrack(
        State(state.clone()),
        headers.clone(),
        Ok(Json(SoundtrackUpdateRequest {
            url: " https://soundcloud.com/artist/track ".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert_eq!(updated.url, "https://soundcloud.com/artist/track");
    assert_eq!(
        hardcore_soundtrack(State(state.clone()), headers.clone())
            .await
            .unwrap()
            .0
            .url,
        updated.url
    );
    assert_eq!(
        public_config(State(state.clone()))
            .await
            .unwrap()
            .0
            .hardcore_soundtrack_url
            .as_deref(),
        Some(updated.url.as_str())
    );

    assert!(matches!(
        update_hardcore_soundtrack(
            State(state.clone()),
            headers.clone(),
            Ok(Json(SoundtrackUpdateRequest {
                url: "https://example.com/track".to_owned(),
            }))
        )
        .await,
        Err(AppError::Validation(_))
    ));
    let Json(cleared) = update_hardcore_soundtrack(
        State(state.clone()),
        headers,
        Ok(Json(SoundtrackUpdateRequest {
            url: " ".to_owned(),
        })),
    )
    .await
    .unwrap();
    assert!(cleared.url.is_empty());

    sqlx::query("INSERT INTO site_settings (key, value, updated_at) VALUES ('hardcore_soundcloud_url', 'https://example.com/bad', 1)")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(
        public_config(State(state))
            .await
            .unwrap()
            .0
            .hardcore_soundtrack_url
            .is_none()
    );
}

#[tokio::test]
async fn malformed_admin_json_reaches_each_admin_payload_boundary() {
    let (state, headers, _, target_id) = admin_state("superadmin").await;
    for method in ["PATCH", "DELETE"] {
        let request = Request::builder()
            .method(method)
            .uri(format!("/admin/users/{target_id}"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ORIGIN, headers[header::ORIGIN].clone())
            .header(header::COOKIE, headers[header::COOKIE].clone())
            .header(
                "x-aaidle-csrf-token",
                headers["x-aaidle-csrf-token"].clone(),
            )
            .body(Body::from("{"))
            .unwrap();
        let response = super::super::router(state.clone())
            .oneshot(request)
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);
    }

    let request = Request::put("/admin/settings/hardcore-soundtrack")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ORIGIN, headers[header::ORIGIN].clone())
        .header(header::COOKIE, headers[header::COOKIE].clone())
        .header(
            "x-aaidle-csrf-token",
            headers["x-aaidle-csrf-token"].clone(),
        )
        .body(Body::from("{"))
        .unwrap();
    let response = super::super::router(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn admin_mutations_surface_database_trigger_failures() {
    let (state, headers, _, target_id) = admin_state("superadmin").await;
    sqlx::query(
        "CREATE TRIGGER reject_admin_update BEFORE UPDATE OF permission ON users BEGIN SELECT RAISE(ABORT, 'forced admin update failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        user_update(
            State(state),
            headers,
            Path(target_id),
            Ok(Json(AdminUserUpdateRequest {
                permission: Some(AdminAssignablePermission::Developer),
                disabled: None,
                disabled_reason: None,
                issue_report_limit: None,
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let (state, headers, _, target_id) = admin_state("superadmin").await;
    let (_, wrong_request, _) = seed_classic_history(&state, &target_id).await;
    sqlx::query(
        "CREATE TRIGGER reject_guess_delete BEFORE DELETE ON guess_events BEGIN SELECT RAISE(ABORT, 'forced guess delete failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        delete_guess(
            State(state),
            headers,
            Path(target_id),
            Ok(Json(AdminDeleteGuessRequest {
                game_key: "classic:llm:challenge".to_owned(),
                request_id: uuid::Uuid::parse_str(&wrong_request).unwrap(),
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let (state, headers, _, _) = admin_state("superadmin").await;
    sqlx::query(
        "CREATE TRIGGER reject_setting_insert BEFORE INSERT ON site_settings BEGIN SELECT RAISE(ABORT, 'forced setting failure'); END",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert!(matches!(
        update_hardcore_soundtrack(
            State(state),
            headers,
            Ok(Json(SoundtrackUpdateRequest {
                url: "https://soundcloud.com/artist/trigger".to_owned(),
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn permission_only_update_and_closed_pool_errors_propagate() {
    let (state, headers, _, target_id) = admin_state("superadmin").await;
    let Json(updated) = user_update(
        State(state.clone()),
        headers.clone(),
        Path(target_id),
        Ok(Json(AdminUserUpdateRequest {
            permission: Some(AdminAssignablePermission::Developer),
            disabled: None,
            disabled_reason: None,
            issue_report_limit: None,
        })),
    )
    .await
    .unwrap();
    assert_eq!(updated.user.user.permission, "developer");

    state.db.close().await;
    assert!(matches!(
        users(
            State(state.clone()),
            headers.clone(),
            Query(AdminUsersQuery {
                page: None,
                query: None,
            }),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        public_config(State(state)).await,
        Err(AppError::Database(_))
    ));
}
