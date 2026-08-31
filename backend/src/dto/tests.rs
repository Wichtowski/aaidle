use super::*;
use serde_json::json;

#[test]
fn credential_requests_use_camel_case_and_reject_unknown_fields() {
    let credentials: PasswordCredentialsRequest = serde_json::from_value(json!({
        "email": "person@example.com",
        "password": "secret"
    }))
    .expect("credentials");
    assert_eq!(credentials.email, "person@example.com");
    assert_eq!(credentials.password, "secret");

    let registration: RegistrationRequest = serde_json::from_value(json!({
        "email": "person@example.com",
        "password": "secret",
        "username": null
    }))
    .expect("registration");
    assert!(registration.username.is_none());
    assert!(
        serde_json::from_value::<PasswordCredentialsRequest>(json!({
            "email": "person@example.com",
            "password": "secret",
            "unexpected": true
        }))
        .is_err()
    );
}

#[test]
fn update_and_issue_requests_deserialize_their_public_contract() {
    let username: UsernameUpdateRequest =
        serde_json::from_value(json!({ "username": "player" })).unwrap();
    assert_eq!(username.username.as_deref(), Some("player"));
    let deletion: AccountDeletionCompletionRequest =
        serde_json::from_value(json!({ "confirmation": "DELETE" })).unwrap();
    assert_eq!(deletion.confirmation, "DELETE");
    let report: IssueReportRequest = serde_json::from_value(json!({
        "game": "classic",
        "title": "Broken",
        "description": "Details"
    }))
    .unwrap();
    assert_eq!(
        (report.game.as_str(), report.title.as_str()),
        ("classic", "Broken")
    );
    assert_eq!(report.description, "Details");
    let soundtrack: SoundtrackUpdateRequest =
        serde_json::from_value(json!({ "url": "https://example.com/audio" })).unwrap();
    assert_eq!(soundtrack.url, "https://example.com/audio");
}

#[test]
fn admin_permissions_round_trip_and_updates_use_camel_case() {
    let user: AdminAssignablePermission = serde_json::from_str("\"user\"").unwrap();
    let developer: AdminAssignablePermission = serde_json::from_str("\"developer\"").unwrap();
    assert_eq!(user.as_str(), "user");
    assert_eq!(developer.as_str(), "developer");

    let update: AdminUserUpdateRequest = serde_json::from_value(json!({
        "permission": "developer",
        "disabled": true,
        "disabledReason": "abuse",
        "issueReportLimit": 3
    }))
    .unwrap();
    assert_eq!(update.permission.unwrap().as_str(), "developer");
    assert_eq!(update.disabled, Some(true));
    assert_eq!(update.disabled_reason.as_deref(), Some("abuse"));
    assert_eq!(update.issue_report_limit, Some(3));
}

#[test]
fn game_requests_deserialize_uuid_and_camel_case_fields() {
    let player_id = Uuid::new_v4();
    let request_id = Uuid::new_v4();
    let guess: GuessRequest = serde_json::from_value(json!({
        "playerId": player_id,
        "requestId": request_id,
        "guessedModelId": "model",
        "attemptNumber": 2
    }))
    .unwrap();
    assert_eq!(guess.player_id, player_id);
    assert_eq!(guess.request_id, request_id);
    assert_eq!(guess.guessed_model_id, "model");
    assert_eq!(guess.attempt_number, 2);

    let timeline: TimelineAttemptRequest = serde_json::from_value(json!({
        "playerId": player_id,
        "requestId": request_id,
        "modelOrder": ["a", "b"]
    }))
    .unwrap();
    assert_eq!(timeline.model_order, ["a", "b"]);
    let speedrun: TimelineSpeedrunStartRequest =
        serde_json::from_value(json!({ "playerId": player_id })).unwrap();
    assert_eq!(speedrun.player_id, player_id);

    let emoji: EmojiDifficultyGuessRequest = serde_json::from_value(json!({
        "playerId": player_id,
        "requestId": request_id,
        "guessedEntityId": "entity",
        "attemptNumber": 1
    }))
    .unwrap();
    assert_eq!(emoji.guessed_entity_id, "entity");
}

#[test]
fn optional_request_fields_accept_absent_and_present_values() {
    let absent: TrajectoryRequest = serde_json::from_value(json!({})).unwrap();
    let present: TrajectoryRequest =
        serde_json::from_value(json!({ "trajectoryAccessToken": "token" })).unwrap();
    assert!(absent.trajectory_access_token.is_none());
    assert_eq!(present.trajectory_access_token.as_deref(), Some("token"));

    let admin_delete: AdminDeleteGuessRequest = serde_json::from_value(json!({
        "gameKey": "classic",
        "requestId": Uuid::nil()
    }))
    .unwrap();
    assert_eq!(admin_delete.game_key, "classic");
    assert_eq!(admin_delete.request_id, Uuid::nil());
}

#[test]
fn response_serialization_uses_public_names_and_omits_empty_optional_fields() {
    let health = HealthResponse {
        status: "ok",
        service: "aidle-api",
        api_version: "v1",
        version: "1.2.3".to_owned(),
    };
    assert_eq!(
        serde_json::to_value(health).unwrap(),
        json!({
            "status": "ok",
            "service": "aidle-api",
            "apiVersion": "v1",
            "version": "1.2.3"
        })
    );

    let deletion = AccountDeletionStatusResponse {
        authorized: false,
        masked_email: None,
        expires_at: None,
    };
    assert_eq!(
        serde_json::to_value(deletion).unwrap(),
        json!({ "authorized": false })
    );
    let email = EmailAcceptedResponse {
        accepted: true,
        activation_url: Some("http://localhost/activate".to_owned()),
    };
    assert_eq!(
        serde_json::to_value(email).unwrap(),
        json!({ "accepted": true, "activationUrl": "http://localhost/activate" })
    );
}

#[test]
fn timeline_optional_fields_are_omitted_only_when_absent() {
    let without_date = TimelinePublicModel {
        id: "a".to_owned(),
        name: "A".to_owned(),
        item_kind: "model".to_owned(),
        categories: vec!["text".to_owned()],
        release_date: None,
        year_annotation: None,
    };
    let value = serde_json::to_value(without_date).unwrap();
    assert!(value.get("releaseDate").is_none());
    assert!(value.get("yearAnnotation").is_none());

    let attempt = TimelineAttemptResponse {
        placements: vec![1, 0],
        attempts_remaining: None,
        revealed_models: Vec::new(),
        speedrun_time_ms: Some(1234),
    };
    let value = serde_json::to_value(attempt).unwrap();
    assert_eq!(value["speedrunTimeMs"], 1234);
    assert_eq!(value["attemptsRemaining"], Value::Null);
}

#[test]
fn player_stats_serialize_nested_distribution_in_camel_case() {
    let stats = PlayerModeStats {
        mode: "classic".to_owned(),
        current_streak: 2,
        best_streak: 5,
        games_played: 8,
        games_won: 4,
        last_played_date: Some("2026-01-01".to_owned()),
        last_solved_date: None,
        guess_distribution: BTreeMap::from([("2".to_owned(), 3)]),
    };
    let value = serde_json::to_value(stats).unwrap();

    assert_eq!(value["currentStreak"], 2);
    assert_eq!(value["lastPlayedDate"], "2026-01-01");
    assert_eq!(value["lastSolvedDate"], Value::Null);
    assert_eq!(value["guessDistribution"]["2"], 3);
}
