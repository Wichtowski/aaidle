use super::*;
use axum::http::{HeaderValue, header};

async fn seed_entities(state: &AppState) {
    for entity in state.emoji.eligible(2) {
        sqlx::query("INSERT INTO visual_clue_entities (id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES (?,?,?,?,?,?,?,0)")
            .bind(&entity.id)
            .bind(&entity.name)
            .bind(serde_json::to_string(&entity.aliases).unwrap())
            .bind(entity.entity_kind.as_str())
            .bind(serde_json::to_string(&entity.categories).unwrap())
            .bind(i64::from(entity.min_pool))
            .bind(serde_json::to_string(entity).unwrap())
            .execute(&state.db)
            .await
            .unwrap();
    }
}

async fn authenticated_headers(state: &AppState, disabled: bool) -> (String, HeaderMap) {
    let user_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id,email,email_normalized,email_verified_at,disabled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
        .bind(&user_id)
        .bind(format!("{user_id}@example.com"))
        .bind(format!("{user_id}@example.com"))
        .bind(1_i64)
        .bind(disabled.then_some(1_i64))
        .bind(0_i64)
        .bind(0_i64)
        .execute(&state.db)
        .await
        .unwrap();
    let token = crate::auth::create_session(&state.db, &user_id, super::super::now_millis())
        .await
        .unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_session={token}; aaidle_csrf=csrf")).unwrap(),
    );
    headers.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    headers.insert("x-aaidle-csrf-token", HeaderValue::from_static("csrf"));
    (user_id, headers)
}

#[tokio::test]
async fn emoji_game_and_lookup_handlers_validate_route_parameters() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path("unknown".to_owned()),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        hints(
            State(state.clone()),
            Path("not-a-uuid".to_owned()),
            Query(EmojiHintsQuery {
                player_id: Uuid::new_v4(),
            }),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        guess_history(
            State(state),
            Path("not-a-uuid".to_owned()),
            Query(EmojiHintsQuery {
                player_id: Uuid::new_v4(),
            }),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn emoji_guesses_reject_invalid_entity_ids_and_attempts_early() {
    let state = super::super::test_support::state().await;
    let peer = ConnectInfo("127.0.0.1:1234".parse().unwrap());
    let request = EmojiDifficultyGuessRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        guessed_entity_id: "bad entity".to_owned(),
        attempt_number: 1,
    };
    assert!(matches!(
        guess(
            State(state.clone()),
            peer,
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request)),
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let request = EmojiDifficultyGuessRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        guessed_entity_id: "entity-one".to_owned(),
        attempt_number: 0,
    };
    assert!(matches!(
        guess(
            State(state),
            peer,
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request)),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn hardcore_emoji_requires_authentication() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        game(State(state), HeaderMap::new(), Path("hardcore".to_owned()),).await,
        Err(AppError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn entity_mapping_preserves_public_fields_and_kind() {
    let state = super::super::test_support::state().await;
    let entity = state.emoji.eligible(0).next().unwrap().clone();
    let expected_id = entity.id.clone();
    let expected_name = entity.name.clone();
    let expected_aliases = entity.aliases.clone();
    let expected_kind = entity.entity_kind.as_str();
    let response = emoji_entity_response(entity);
    assert_eq!(response.id, expected_id);
    assert_eq!(response.name, expected_name);
    assert_eq!(response.aliases, expected_aliases);
    assert_eq!(response.entity_kind, expected_kind);
}

#[tokio::test]
async fn emoji_game_guess_hints_and_history_succeed_with_seeded_data() {
    let state = super::super::test_support::state().await;
    seed_entities(&state).await;
    let Json(game_response) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path("normal".to_owned()),
    )
    .await
    .unwrap();
    assert_eq!(game_response.challenge.difficulty, "normal");
    assert!(!game_response.entities.is_empty());
    assert_eq!(game_response.global_completion_count, 0);

    let challenge_id = game_response.challenge.id;
    let player_id = Uuid::new_v4();
    let answer = sqlx::query_scalar::<_, String>(
        "SELECT answer_entity_id FROM visual_clue_challenges WHERE id = ?",
    )
    .bind(challenge_id.to_string())
    .fetch_one(&state.db)
    .await
    .unwrap();
    let Json(outcome) = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.1:1234".parse().unwrap()),
        HeaderMap::new(),
        Path(challenge_id.to_string()),
        Ok(Json(EmojiDifficultyGuessRequest {
            player_id,
            request_id: Uuid::new_v4(),
            guessed_entity_id: answer,
            attempt_number: 1,
        })),
    )
    .await
    .unwrap();
    assert!(outcome.is_correct);
    assert_eq!(outcome.global_completion_count, 1);

    let Json(hints_response) = hints(
        State(state.clone()),
        Path(challenge_id.to_string()),
        Query(EmojiHintsQuery { player_id }),
    )
    .await
    .unwrap();
    assert!(!hints_response.clues.is_empty());
    let Json(history) = guess_history(
        State(state),
        Path(challenge_id.to_string()),
        Query(EmojiHintsQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(history.guesses.len(), 1);
    assert_eq!(history.clues, hints_response.clues);
}

#[tokio::test]
async fn emoji_authenticated_and_hardcore_authorization_branches_are_enforced() {
    let state = super::super::test_support::state().await;
    seed_entities(&state).await;
    let (_, headers) = authenticated_headers(&state, false).await;
    assert!(matches!(
        game(
            State(state.clone()),
            headers.clone(),
            Path("hardcore".to_owned()),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    let (user_id, unlocked_headers) = authenticated_headers(&state, false).await;
    crate::auth::grant_hardcore_access(&state.db, &user_id, super::super::now_millis())
        .await
        .unwrap();
    let Json(hardcore) = game(
        State(state.clone()),
        unlocked_headers.clone(),
        Path("hardcore".to_owned()),
    )
    .await
    .unwrap();
    assert_eq!(hardcore.challenge.difficulty, "hardcore");

    let Json(normal) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path("normal".to_owned()),
    )
    .await
    .unwrap();
    let answer = sqlx::query_scalar::<_, String>(
        "SELECT answer_entity_id FROM visual_clue_challenges WHERE id = ?",
    )
    .bind(normal.challenge.id.to_string())
    .fetch_one(&state.db)
    .await
    .unwrap();
    let Json(authenticated_guess) = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.2:1234".parse().unwrap()),
        unlocked_headers,
        Path(normal.challenge.id.to_string()),
        Ok(Json(EmojiDifficultyGuessRequest {
            player_id: Uuid::new_v4(),
            request_id: Uuid::new_v4(),
            guessed_entity_id: answer,
            attempt_number: 1,
        })),
    )
    .await
    .unwrap();
    assert!(authenticated_guess.is_correct);

    let (_, disabled_headers) = authenticated_headers(&state, true).await;
    let request = EmojiDifficultyGuessRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        guessed_entity_id: state.emoji.eligible(0).next().unwrap().id.clone(),
        attempt_number: 1,
    };
    assert!(matches!(
        guess(
            State(state),
            ConnectInfo("127.0.0.2:1234".parse().unwrap()),
            disabled_headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request)),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
}
