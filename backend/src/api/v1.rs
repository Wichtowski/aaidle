use axum::{
    Json, Router,
    extract::DefaultBodyLimit,
    extract::{ConnectInfo, Path, Query, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::Value;
use sqlx::FromRow;
use std::net::{IpAddr, SocketAddr};
use time::macros::format_description;
use time::{OffsetDateTime, format_description::FormatItem};
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::{
    dto::{
        AcceptedResponse, AdminCompletion, AdminDeleteGuessRequest, AdminUserDetail,
        AdminUserDetailResponse, AdminUserSummary, AdminUserUpdateRequest, AdminUsersResponse,
        AuthMeResponse, AuthUserResponse, AuthenticatedResponse, ChallengeStatsResponse,
        ClassicGameResponse, EmailAcceptedResponse, EmojiFamilyResponse, EmojiGameResponse,
        EmojiGuessRequest, EmojiGuessResponse, EmojiHintsResponse, GuessRequest, GuessResponse,
        HardcoreAccessResponse, HealthResponse, ModelsResponse, PasswordCredentialsRequest,
        PlayerStatsResponse, ProgressResponse, PublicChallenge, PublicConfigResponse,
        PublicEmojiChallenge, SoundtrackResponse, SoundtrackUpdateRequest, TrajectoryRequest,
        TrajectoryResponse,
    },
    error::{AppError, AppResult},
    repository::{self, EmojiGuessInput, GuessInput},
    state::AppState,
};

const DATE_FORMAT: &[FormatItem<'static>] = format_description!("[year]-[month]-[day]");
const MAX_BODY_BYTES: usize = 16 * 1024;

pub fn router(state: AppState) -> Router {
    let request_id = HeaderName::from_static("x-request-id");
    Router::new()
        .route("/health", get(health))
        .route("/health/ready", get(ready))
        .route("/auth/register", post(register))
        .route("/auth/password", post(password_login))
        .route("/auth/password-reset", post(password_reset))
        .route("/auth/password-reset/verify", get(password_reset_verify))
        .route(
            "/auth/password-reset/complete",
            post(password_reset_complete),
        )
        .route("/auth/email-verification", post(email_verification))
        .route(
            "/auth/email-verification/verify",
            get(email_verification_verify),
        )
        .route("/auth/account-deletion", post(account_deletion))
        .route(
            "/auth/account-deletion/verify",
            get(account_deletion_verify),
        )
        .route(
            "/auth/account-deletion/complete",
            post(account_deletion_complete),
        )
        .route(
            "/auth/progress",
            get(progress_get)
                .put(progress_put)
                .layer(DefaultBodyLimit::max(1_000_000)),
        )
        .route("/auth/oauth/{provider}", get(oauth_start))
        .route("/auth/oauth/{provider}/callback", get(oauth_callback))
        .route("/auth/me", get(auth_me))
        .route("/auth/logout", post(logout))
        .route("/admin/users", get(admin_users))
        .route(
            "/admin/users/{user_id}",
            get(admin_user_detail)
                .patch(admin_user_update)
                .delete(admin_delete_guess),
        )
        .route(
            "/admin/settings/hardcore-soundtrack",
            get(admin_hardcore_soundtrack).put(admin_update_hardcore_soundtrack),
        )
        .route("/public-config", get(public_config))
        .route("/models", get(models))
        .route("/games/classic/{category}/{difficulty}", get(classic_game))
        .route("/games/classic/hardcore", get(hardcore_game))
        .route("/games/classic/hardcore/access", post(hardcore_access))
        .route(
            "/games/classic/challenges/{challenge_id}/guesses",
            post(classic_guess),
        )
        .route(
            "/games/classic/challenges/{challenge_id}/stats",
            get(classic_challenge_stats),
        )
        .route(
            "/games/classic/challenges/{challenge_id}/trajectory",
            post(classic_trajectory),
        )
        .route("/games/emoji", get(emoji_game))
        .route(
            "/games/emoji/challenges/{challenge_id}/guesses",
            post(emoji_guess),
        )
        .route(
            "/games/emoji/challenges/{challenge_id}/hints",
            get(emoji_hints),
        )
        .route("/players/{player_id}/stats", get(player_stats))
        .with_state(state.clone())
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CompressionLayer::new().br(true))
                .layer(TimeoutLayer::with_status_code(
                    StatusCode::REQUEST_TIMEOUT,
                    state.config.request_timeout,
                ))
                .layer(SetRequestIdLayer::new(request_id.clone(), MakeRequestUuid))
                .layer(PropagateRequestIdLayer::new(request_id))
                .layer(DefaultBodyLimit::max(MAX_BODY_BYTES)),
        )
}

#[derive(FromRow)]
struct AdminUserRow {
    id: String,
    email: String,
    display_name: Option<String>,
    email_verified_at: Option<i64>,
    created_at: i64,
    updated_at: i64,
    permission: String,
    disabled_at: Option<i64>,
    disabled_reason: Option<String>,
    disabled_by_email: Option<String>,
    password_hash: Option<String>,
    identity_providers: Option<String>,
    last_seen_at: Option<i64>,
    progress_json: Option<String>,
    progress_updated_at: Option<i64>,
    completion_count: i64,
}

#[derive(FromRow)]
struct AdminCompletionRow {
    challenge_id: String,
    challenge_date: String,
    mode: String,
    answer_model_name: String,
    completed_at: i64,
}

#[derive(Deserialize)]
struct AdminUsersQuery {
    page: Option<i64>,
    query: Option<String>,
}

async fn admin_users(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AdminUsersQuery>,
) -> AppResult<Json<AdminUsersResponse>> {
    admin_user_for_request(&state, &headers, false).await?;
    let page = query.page.unwrap_or(1);
    if !(1..=1_000_000).contains(&page) {
        return Err(AppError::validation("page must be between 1 and 1000000"));
    }
    let search = query.query.unwrap_or_default();
    if search.len() > 100 {
        return Err(AppError::validation("query must not exceed 100 characters"));
    }
    let pattern = format!("%{}%", escape_like(&search.to_ascii_lowercase()));
    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE email_normalized LIKE ? ESCAPE '\\' OR LOWER(COALESCE(display_name, '')) LIKE ? ESCAPE '\\'",
    )
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&state.db)
    .await?;
    let rows = sqlx::query_as::<_, AdminUserRow>(
        "SELECT u.id, u.email, u.display_name, u.email_verified_at, u.created_at, u.updated_at, u.permission, \
         u.disabled_at, u.disabled_reason, NULL AS disabled_by_email, u.password_hash, \
         (SELECT GROUP_CONCAT(i.provider, ',') FROM user_identities i WHERE i.user_id = u.id) AS identity_providers, \
         (SELECT MAX(s.last_seen_at) FROM user_sessions s WHERE s.user_id = u.id) AS last_seen_at, \
         NULL AS progress_json, p.updated_at AS progress_updated_at, \
         (SELECT COUNT(*) FROM user_challenge_completions c WHERE c.user_id = u.id) AS completion_count \
         FROM users u LEFT JOIN user_progress p ON p.user_id = u.id \
         WHERE u.email_normalized LIKE ? ESCAPE '\\' OR LOWER(COALESCE(u.display_name, '')) LIKE ? ESCAPE '\\' \
         ORDER BY u.created_at DESC, u.id DESC LIMIT 50 OFFSET ?",
    )
    .bind(&pattern)
    .bind(&pattern)
    .bind((page - 1) * 50)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(AdminUsersResponse {
        users: rows.into_iter().map(admin_user_summary).collect(),
        total,
        page,
        page_size: 50,
    }))
}

async fn admin_user_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> AppResult<Json<AdminUserDetailResponse>> {
    admin_user_for_request(&state, &headers, false).await?;
    let user = load_admin_user_detail(&state, &user_id).await?;
    Ok(Json(AdminUserDetailResponse { user }))
}

async fn admin_user_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    payload: Result<Json<AdminUserUpdateRequest>, JsonRejection>,
) -> AppResult<Json<AdminUserDetailResponse>> {
    let administrator = admin_user_for_request(&state, &headers, true).await?;
    assert_same_origin(&state, &headers)?;
    if user_id == administrator.id {
        return Err(AppError::validation(
            "You cannot change your own administrator access.",
        ));
    }
    let payload = parse_json_payload(payload)?;
    if payload.permission.is_none() && payload.disabled.is_none() {
        return Err(AppError::validation("Choose an account update."));
    }
    let disabled_reason = payload.disabled_reason.as_deref().map(str::trim);
    if disabled_reason.is_some_and(|value| value.len() > 500)
        || payload.disabled == Some(true) && disabled_reason.is_none_or(str::is_empty)
    {
        return Err(AppError::validation(
            "Enter a disable reason up to 500 characters.",
        ));
    }
    let mut transaction = state.db.begin().await?;
    let target = sqlx::query_as::<_, (String,)>("SELECT permission FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found.".to_owned()))?;
    if target.0 == "superadmin" {
        return Err(AppError::Forbidden(
            "Super administrator accounts cannot be changed here.".to_owned(),
        ));
    }
    let now = now_millis();
    if let Some(permission) = payload.permission {
        sqlx::query("UPDATE users SET permission = ?, updated_at = ? WHERE id = ?")
            .bind(permission.as_str())
            .bind(now)
            .bind(&user_id)
            .execute(&mut *transaction)
            .await?;
    }
    if let Some(disabled) = payload.disabled {
        if disabled {
            sqlx::query("UPDATE users SET disabled_at = ?, disabled_reason = ?, disabled_by_user_id = ?, updated_at = ? WHERE id = ?")
                .bind(now)
                .bind(disabled_reason)
                .bind(&administrator.id)
                .bind(now)
                .bind(&user_id)
                .execute(&mut *transaction)
                .await?;
        } else {
            sqlx::query("UPDATE users SET disabled_at = NULL, disabled_reason = NULL, disabled_by_user_id = NULL, updated_at = ? WHERE id = ?")
                .bind(now)
                .bind(&user_id)
                .execute(&mut *transaction)
                .await?;
        }
    }
    transaction.commit().await?;
    Ok(Json(AdminUserDetailResponse {
        user: load_admin_user_detail(&state, &user_id).await?,
    }))
}

async fn admin_delete_guess(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    payload: Result<Json<AdminDeleteGuessRequest>, JsonRejection>,
) -> AppResult<Json<AdminUserDetailResponse>> {
    let administrator = admin_user_for_request(&state, &headers, true).await?;
    assert_same_origin(&state, &headers)?;
    if user_id == administrator.id {
        return Err(AppError::validation(
            "You cannot remove your own saved guesses.",
        ));
    }
    let payload = parse_json_payload(payload)?;
    if payload.game_key.is_empty() || payload.game_key.len() > 300 {
        return Err(AppError::validation("gameKey is invalid"));
    }
    let mut transaction = state.db.begin().await?;
    let progress_json = sqlx::query_scalar::<_, String>(
        "SELECT progress_json FROM user_progress WHERE user_id = ?",
    )
    .bind(&user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Saved progress was not found.".to_owned()))?;
    let mut progress = crate::progress::parse_progress(serde_json::from_str(&progress_json)?)?;
    let game = progress
        .pointer_mut(&format!(
            "/games/{}",
            payload.game_key.replace('~', "~0").replace('/', "~1")
        ))
        .and_then(Value::as_object_mut)
        .ok_or_else(|| AppError::NotFound("The saved game was not found.".to_owned()))?;
    let challenge_id = game
        .get("challengeId")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Unavailable("Stored progress is invalid.".to_owned()))?
        .to_owned();
    let guesses = game
        .get_mut("guesses")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| AppError::Unavailable("Stored progress is invalid.".to_owned()))?;
    let initial_len = guesses.len();
    guesses.retain(|guess| {
        guess.get("requestId").and_then(Value::as_str) != Some(&payload.request_id.to_string())
    });
    if guesses.len() == initial_len {
        return Err(AppError::NotFound(
            "The saved guess was not found.".to_owned(),
        ));
    }
    let solved = guesses
        .iter()
        .any(|guess| guess.get("isCorrect").and_then(Value::as_bool) == Some(true));
    if !solved {
        game.insert("status".to_owned(), Value::String("in-progress".to_owned()));
        game.insert("completedAt".to_owned(), Value::Null);
    }
    let progress = crate::progress::parse_progress(progress)?;
    sqlx::query("UPDATE user_progress SET progress_json = ?, updated_at = ? WHERE user_id = ?")
        .bind(serde_json::to_string(&progress)?)
        .bind(now_millis())
        .bind(&user_id)
        .execute(&mut *transaction)
        .await?;
    if !solved {
        sqlx::query(
            "DELETE FROM user_challenge_completions WHERE user_id = ? AND challenge_id = ?",
        )
        .bind(&user_id)
        .bind(challenge_id)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(Json(AdminUserDetailResponse {
        user: load_admin_user_detail(&state, &user_id).await?,
    }))
}

async fn admin_hardcore_soundtrack(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<SoundtrackResponse>> {
    admin_user_for_request(&state, &headers, true).await?;
    let url = sqlx::query_scalar::<_, String>(
        "SELECT value FROM site_settings WHERE key = 'hardcore_soundcloud_url'",
    )
    .fetch_optional(&state.db)
    .await?
    .unwrap_or_default();
    Ok(Json(SoundtrackResponse { url }))
}

async fn admin_update_hardcore_soundtrack(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<SoundtrackUpdateRequest>, JsonRejection>,
) -> AppResult<Json<SoundtrackResponse>> {
    admin_user_for_request(&state, &headers, true).await?;
    assert_same_origin(&state, &headers)?;
    let payload = parse_json_payload(payload)?;
    if payload.url.len() > 2_048 {
        return Err(AppError::validation("url must not exceed 2048 characters"));
    }
    let url = normalize_soundcloud_url(&payload.url)?;
    match &url {
        Some(url) => {
            sqlx::query("INSERT INTO site_settings (key, value, updated_at) VALUES ('hardcore_soundcloud_url', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
                .bind(url)
                .bind(now_millis())
                .execute(&state.db)
                .await?;
        }
        None => {
            sqlx::query("DELETE FROM site_settings WHERE key = 'hardcore_soundcloud_url'")
                .execute(&state.db)
                .await?;
        }
    }
    Ok(Json(SoundtrackResponse {
        url: url.unwrap_or_default(),
    }))
}

async fn public_config(State(state): State<AppState>) -> AppResult<Json<PublicConfigResponse>> {
    let url = sqlx::query_scalar::<_, String>(
        "SELECT value FROM site_settings WHERE key = 'hardcore_soundcloud_url'",
    )
    .fetch_optional(&state.db)
    .await?
    .and_then(|value| normalize_soundcloud_url(&value).ok().flatten());
    Ok(Json(PublicConfigResponse {
        hardcore_soundtrack_url: url,
    }))
}

async fn admin_user_for_request(
    state: &AppState,
    headers: &HeaderMap,
    require_superadmin: bool,
) -> AppResult<crate::auth::SessionUser> {
    let user = crate::auth::user_for_session(&state.db, session_cookie(headers), now_millis())
        .await?
        .ok_or_else(|| AppError::Unauthorized("Sign in to access admin tools.".to_owned()))?;
    if user.disabled
        || !user.permission.can_manage_users()
        || require_superadmin && !user.permission.can_manage_administrators()
    {
        return Err(AppError::Forbidden(
            "You do not have permission to access this admin operation.".to_owned(),
        ));
    }
    Ok(user)
}

async fn load_admin_user_detail(state: &AppState, user_id: &str) -> AppResult<AdminUserDetail> {
    let row = sqlx::query_as::<_, AdminUserRow>(
        "SELECT u.id, u.email, u.display_name, u.email_verified_at, u.created_at, u.updated_at, u.permission, \
         u.disabled_at, u.disabled_reason, disabled_by.email AS disabled_by_email, u.password_hash, \
         (SELECT GROUP_CONCAT(i.provider, ',') FROM user_identities i WHERE i.user_id = u.id) AS identity_providers, \
         (SELECT MAX(s.last_seen_at) FROM user_sessions s WHERE s.user_id = u.id) AS last_seen_at, \
         p.progress_json, p.updated_at AS progress_updated_at, \
         (SELECT COUNT(*) FROM user_challenge_completions c WHERE c.user_id = u.id) AS completion_count \
         FROM users u LEFT JOIN user_progress p ON p.user_id = u.id \
         LEFT JOIN users disabled_by ON disabled_by.id = u.disabled_by_user_id WHERE u.id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found.".to_owned()))?;
    let completions = sqlx::query_as::<_, AdminCompletionRow>(
        "SELECT c.challenge_id, d.challenge_date, d.mode, m.name AS answer_model_name, c.completed_at \
         FROM user_challenge_completions c JOIN daily_challenges d ON d.id = c.challenge_id \
         JOIN models m ON m.id = d.answer_model_id WHERE c.user_id = ? ORDER BY c.completed_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|row| AdminCompletion {
        challenge_id: row.challenge_id,
        challenge_date: row.challenge_date,
        mode: row.mode,
        answer_model_name: row.answer_model_name,
        completed_at: row.completed_at,
    })
    .collect();
    let hardcore_unlocked = crate::auth::has_hardcore_access(&state.db, user_id).await?;
    let disabled_by_email = row.disabled_by_email.clone();
    let progress = row
        .progress_json
        .as_deref()
        .map(serde_json::from_str::<Value>)
        .transpose()?
        .map(crate::progress::parse_progress)
        .transpose()?;
    Ok(AdminUserDetail {
        user: admin_user_summary(row),
        disabled_by_email,
        hardcore_unlocked,
        progress,
        completions,
    })
}

fn admin_user_summary(row: AdminUserRow) -> AdminUserSummary {
    let mut sign_in_providers: Vec<String> = row
        .identity_providers
        .as_deref()
        .map(|value| {
            value
                .split(',')
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();
    if row.password_hash.is_some() {
        sign_in_providers.insert(0, "password".to_owned());
    }
    AdminUserSummary {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        email_verified_at: row.email_verified_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        permission: crate::auth::Permission::parse(&row.permission)
            .expect("stored permission is validated by the database")
            .as_str(),
        disabled_at: row.disabled_at,
        disabled_reason: row.disabled_reason,
        sign_in_providers,
        last_seen_at: row.last_seen_at,
        progress_updated_at: row.progress_updated_at,
        completion_count: row.completion_count,
    }
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn normalize_soundcloud_url(value: &str) -> AppResult<Option<String>> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let url = reqwest::Url::parse(value).map_err(|_| {
        AppError::validation("Enter a public HTTPS SoundCloud track or playlist URL.")
    })?;
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if url.scheme() != "https" || !(host == "soundcloud.com" || host.ends_with(".soundcloud.com")) {
        return Err(AppError::validation(
            "Enter a public HTTPS SoundCloud track or playlist URL.",
        ));
    }
    Ok(Some(url.to_string()))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "aidle-api",
        api_version: "v1",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn ready(State(state): State<AppState>) -> AppResult<Json<HealthResponse>> {
    sqlx::query("SELECT 1").fetch_one(&state.db).await?;
    Ok(health().await)
}

#[derive(Deserialize)]
struct ModelsQuery {
    cursor: Option<String>,
    limit: Option<u16>,
}

async fn models(
    State(state): State<AppState>,
    Query(query): Query<ModelsQuery>,
) -> AppResult<impl IntoResponse> {
    if query
        .cursor
        .as_deref()
        .is_some_and(|cursor| cursor.len() > 128)
    {
        return Err(AppError::validation(
            "cursor must not exceed 128 characters",
        ));
    }
    let limit = i64::from(query.limit.unwrap_or(50));
    if !(1..=100).contains(&limit) {
        return Err(AppError::validation("limit must be between 1 and 100"));
    }
    let (models, next_cursor) =
        repository::list_public_models(&state.db, query.cursor.as_deref(), limit).await?;
    Ok((
        [("cache-control", "public, max-age=300, s-maxage=3600")],
        Json(ModelsResponse {
            models,
            next_cursor,
        }),
    ))
}

async fn classic_guess(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    payload: Result<Json<GuessRequest>, JsonRejection>,
) -> AppResult<Json<GuessResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = payload
        .map_err(|error| match error {
            JsonRejection::BytesRejection(_) => AppError::PayloadTooLarge,
            _ => AppError::validation("Request body must be valid JSON."),
        })?
        .0;
    if !is_model_id(&payload.guessed_model_id) {
        return Err(AppError::validation("guessedModelId is invalid"));
    }
    if !(1..=100).contains(&payload.attempt_number) {
        return Err(AppError::validation(
            "attemptNumber must be between 1 and 100",
        ));
    }
    let result = repository::process_guess(
        &state.db,
        GuessInput {
            challenge_id,
            player_id: payload.player_id,
            request_id: payload.request_id,
            guessed_model_id: payload.guessed_model_id,
            attempt_number: payload.attempt_number,
        },
    )
    .await?;
    let trajectory_access_token = if result.is_correct {
        let (challenge, _) = repository::classic_trajectory(&state.db, challenge_id).await?;
        Some(crate::domain::trajectory::create_access_token(
            &state.config.auth_secret,
            &challenge.id,
            &challenge.answer_model_id,
        )?)
    } else {
        None
    };
    Ok(Json(GuessResponse {
        guessed_model: result.guessed_model,
        comparison: result.comparison,
        is_correct: result.is_correct,
        attempt_number: result.attempt_number,
        player_stats: result.player_stats,
        global_completion_count: result.completion_count,
        trajectory_access_token,
    }))
}

async fn classic_trajectory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(challenge_id): Path<String>,
    payload: Result<Json<TrajectoryRequest>, JsonRejection>,
) -> AppResult<Json<TrajectoryResponse>> {
    assert_same_origin(&state, &headers)?;
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    let (challenge, models) = repository::classic_trajectory(&state.db, challenge_id).await?;
    let session_user =
        crate::auth::user_for_session(&state.db, session_cookie(&headers), now_millis()).await?;
    if session_user.as_ref().is_some_and(|user| user.disabled) {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    let has_completion = match session_user {
        Some(user) => sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM user_challenge_completions WHERE user_id = ? AND challenge_id = ?)",
        )
        .bind(user.id)
        .bind(&challenge.id)
        .fetch_one(&state.db)
        .await?
            != 0,
        None => false,
    };
    if !has_completion
        && !crate::domain::trajectory::has_access(
            &state.config.auth_secret,
            payload.trajectory_access_token.as_deref(),
            &challenge.id,
            &challenge.answer_model_id,
        )?
    {
        return Err(AppError::Forbidden(
            "Solve this challenge to view its model-space trajectory.".to_owned(),
        ));
    }
    Ok(Json(TrajectoryResponse { models }))
}

async fn emoji_game(State(state): State<AppState>) -> AppResult<Json<EmojiGameResponse>> {
    let date = current_utc_date()?;
    let game =
        repository::emoji_game(&state.db, &date, &state.config.daily_selection_secret).await?;
    Ok(Json(EmojiGameResponse {
        challenge: PublicEmojiChallenge {
            id: parse_uuid(&game.challenge.id, "Stored challenge ID is invalid.")?,
            date: game.challenge.challenge_date,
            mode: "emoji",
            expires_at: format_next_midnight()?,
            initial_emoji: game.initial_emoji,
            maximum_emoji: game.maximum_emoji,
        },
        families: game
            .families
            .into_iter()
            .map(emoji_family_response)
            .collect(),
        global_completion_count: game.completion_count,
    }))
}

async fn classic_game(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((category, difficulty)): Path<(String, String)>,
) -> AppResult<Json<ClassicGameResponse>> {
    let category = repository::ClassicCategory::parse(&category)
        .ok_or_else(|| AppError::validation("Unknown Classic category."))?;
    let difficulty = repository::ClassicDifficulty::parse(&difficulty)
        .ok_or_else(|| AppError::validation("Unknown Classic difficulty."))?;
    classic_game_response(&state, &headers, category, difficulty).await
}

async fn hardcore_game(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<ClassicGameResponse>> {
    classic_game_response(
        &state,
        &headers,
        repository::ClassicCategory::Hardcore,
        repository::ClassicDifficulty::Hardcore,
    )
    .await
}

async fn hardcore_access(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(
    [(&'static str, &'static str); 1],
    Json<HardcoreAccessResponse>,
)> {
    assert_same_origin(&state, &headers)?;
    let user = authenticated_user(&state, &headers).await?;
    if !crate::auth::has_hardcore_access(&state.db, &user.id).await? {
        let today = current_utc_date()?;
        let completed = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT d.mode) \
             FROM user_challenge_completions c \
             JOIN daily_challenges d ON d.id = c.challenge_id \
             WHERE c.user_id = ? AND d.challenge_date = ? \
             AND d.mode IN ('classic:llm:challenge', 'classic:cv:challenge', 'classic:nlp:challenge', \
                            'classic:od:challenge', 'classic:classical-ml:challenge', 'classic:filters:challenge')",
        )
        .bind(&user.id)
        .bind(today)
        .fetch_one(&state.db)
        .await?;
        if completed != 6 {
            return Err(AppError::Forbidden(
                "Complete all six Challenge boards today to enter Hardcore.".to_owned(),
            ));
        }
        crate::auth::grant_hardcore_access(&state.db, &user.id, now_millis()).await?;
    }
    Ok((
        [("cache-control", "no-store")],
        Json(HardcoreAccessResponse { unlocked: true }),
    ))
}

async fn classic_game_response(
    state: &AppState,
    headers: &HeaderMap,
    category: repository::ClassicCategory,
    difficulty: repository::ClassicDifficulty,
) -> AppResult<Json<ClassicGameResponse>> {
    if category == repository::ClassicCategory::Hardcore {
        let user = authenticated_user(state, headers).await?;
        if user.disabled || !crate::auth::has_hardcore_access(&state.db, &user.id).await? {
            return Err(AppError::Forbidden(
                "Hardcore access has not been unlocked for this account.".to_owned(),
            ));
        }
    }
    let game = repository::classic_game(
        &state.db,
        &current_utc_date()?,
        category,
        difficulty,
        &state.config.daily_selection_secret,
        crate::config::DAILY_ANSWER_COOLDOWN_DAYS,
    )
    .await?;
    Ok(Json(ClassicGameResponse {
        challenge: PublicChallenge {
            id: parse_uuid(&game.challenge.id, "Stored challenge ID is invalid.")?,
            date: game.challenge.challenge_date,
            mode: game.challenge.mode,
            expires_at: format_next_midnight()?,
        },
        models: game.models,
        columns: game.columns,
        global_completion_count: game.completion_count,
    }))
}

async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    payload: Result<Json<PasswordCredentialsRequest>, JsonRejection>,
) -> AppResult<(
    StatusCode,
    [(&'static str, &'static str); 1],
    Json<EmailAcceptedResponse>,
)> {
    assert_same_origin(&state, &headers)?;
    let payload = parse_json_payload(payload)?;
    let email = crate::auth::normalize_email(&payload.email)?;
    consume_auth_rate_limit(
        &state,
        &headers,
        Some(peer),
        "register",
        &email,
        3,
        60 * 60 * 1_000,
    )
    .await?;
    let now = now_millis();
    let user = match crate::auth::register_with_password(&state.db, &email, &payload.password, now)
        .await
    {
        Ok(user) => user,
        Err(AppError::Conflict(value)) if value == "ACCOUNT_EXISTS" => {
            return Ok((
                StatusCode::ACCEPTED,
                [("cache-control", "no-store")],
                Json(EmailAcceptedResponse {
                    accepted: true,
                    activation_url: None,
                }),
            ));
        }
        Err(error) => return Err(error),
    };
    let token = crate::auth::create_email_verification_token(&state.db, &user.id, now).await?;
    let delivery = crate::email::send_auth_email(
        &state.http,
        &state.config,
        &user.email,
        crate::email::AuthEmailPurpose::EmailVerification,
        &token,
    )
    .await?;
    Ok((
        StatusCode::ACCEPTED,
        [("cache-control", "no-store")],
        Json(EmailAcceptedResponse {
            accepted: true,
            activation_url: delivery.local_url,
        }),
    ))
}

async fn password_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    payload: Result<Json<PasswordCredentialsRequest>, JsonRejection>,
) -> AppResult<(
    [(header::HeaderName, HeaderValue); 2],
    Json<AuthenticatedResponse>,
)> {
    assert_same_origin(&state, &headers)?;
    let payload = parse_json_payload(payload)?;
    let email = crate::auth::normalize_email(&payload.email)?;
    consume_auth_rate_limit(
        &state,
        &headers,
        Some(peer),
        "password-login",
        &email,
        10,
        5 * 60 * 1_000,
    )
    .await?;
    let user =
        crate::auth::authenticate_with_password(&state.db, &email, &payload.password).await?;
    let token = crate::auth::create_session(&state.db, &user.id, now_millis()).await?;
    Ok((
        no_store_with_cookie(&state, token)?,
        Json(AuthenticatedResponse {
            user: auth_user_response(user),
        }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EmailRequest {
    email: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PasswordResetCompletionRequest {
    password: String,
}

async fn email_verification(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    payload: Result<Json<EmailRequest>, JsonRejection>,
) -> AppResult<(
    StatusCode,
    [(&'static str, &'static str); 1],
    Json<EmailAcceptedResponse>,
)> {
    assert_same_origin(&state, &headers)?;
    let payload = parse_json_payload(payload)?;
    let email = crate::auth::normalize_email(&payload.email)?;
    consume_auth_rate_limit(
        &state,
        &headers,
        Some(peer),
        "email-verification",
        &email,
        3,
        60 * 60 * 1_000,
    )
    .await?;
    let activation_url = if let Some((email, token)) =
        crate::auth::create_email_verification_token_for_email(&state.db, &email, now_millis())
            .await?
    {
        crate::email::send_auth_email(
            &state.http,
            &state.config,
            &email,
            crate::email::AuthEmailPurpose::EmailVerification,
            &token,
        )
        .await?
        .local_url
    } else {
        None
    };
    Ok((
        StatusCode::ACCEPTED,
        [("cache-control", "no-store")],
        Json(EmailAcceptedResponse {
            accepted: true,
            activation_url,
        }),
    ))
}

async fn email_verification_verify(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
) -> AppResult<Response> {
    if !is_token(&query.token) {
        return redirect(
            &state,
            "/login?error=activation",
            None,
            StatusCode::SEE_OTHER,
        );
    }
    let location =
        if crate::auth::verify_email_address(&state.db, &query.token, now_millis()).await? {
            "/login?activated=1"
        } else {
            "/login?error=activation"
        };
    redirect(&state, location, None, StatusCode::SEE_OTHER)
}

async fn password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    payload: Result<Json<EmailRequest>, JsonRejection>,
) -> AppResult<(
    StatusCode,
    [(&'static str, &'static str); 1],
    Json<AcceptedResponse>,
)> {
    assert_same_origin(&state, &headers)?;
    let payload = parse_json_payload(payload)?;
    let email = crate::auth::normalize_email(&payload.email)?;
    consume_auth_rate_limit(
        &state,
        &headers,
        Some(peer),
        "password-reset",
        &email,
        3,
        60 * 60 * 1_000,
    )
    .await?;
    if let Some((email, token)) =
        crate::auth::create_password_reset_token(&state.db, &email, now_millis()).await?
    {
        crate::email::send_auth_email(
            &state.http,
            &state.config,
            &email,
            crate::email::AuthEmailPurpose::PasswordReset,
            &token,
        )
        .await?;
    }
    Ok((
        StatusCode::ACCEPTED,
        [("cache-control", "no-store")],
        Json(AcceptedResponse { accepted: true }),
    ))
}

#[derive(Deserialize)]
struct TokenQuery {
    token: String,
}

async fn password_reset_verify(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
) -> AppResult<Response> {
    if !is_token(&query.token) {
        return redirect(
            &state,
            "/login?error=reset-link",
            None,
            StatusCode::SEE_OTHER,
        );
    }
    redirect(
        &state,
        "/reset-password",
        Some(("aaidle_password_reset", query.token, 15 * 60)),
        StatusCode::SEE_OTHER,
    )
}

async fn password_reset_complete(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<PasswordResetCompletionRequest>, JsonRejection>,
) -> AppResult<Response> {
    assert_same_origin(&state, &headers)?;
    let payload = parse_json_payload(payload)?;
    let Some(token) = cookie_value(&headers, "aaidle_password_reset") else {
        return Err(AppError::Validation(
            "This password reset link is invalid or expired.".to_owned(),
        ));
    };
    let Some(user_id) =
        crate::auth::reset_password_with_token(&state.db, token, &payload.password, now_millis())
            .await?
    else {
        return Err(AppError::Validation(
            "This password reset link is invalid or expired.".to_owned(),
        ));
    };
    let session = crate::auth::create_session(&state.db, &user_id, now_millis()).await?;
    let mut response_headers = HeaderMap::new();
    response_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response_headers.append(
        header::SET_COOKIE,
        named_cookie_header(&state, "aaidle_password_reset", "", 0)?,
    );
    response_headers.append(
        header::SET_COOKIE,
        cookie_header(&state, &session, 30 * 24 * 60 * 60)?,
    );
    Ok((response_headers, Json(serde_json::json!({"ok": true}))).into_response())
}

async fn account_deletion(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
) -> AppResult<(
    StatusCode,
    [(&'static str, &'static str); 1],
    Json<AcceptedResponse>,
)> {
    assert_same_origin(&state, &headers)?;
    let user = authenticated_user(&state, &headers).await?;
    consume_auth_rate_limit(
        &state,
        &headers,
        Some(peer),
        "account-deletion",
        &user.email,
        3,
        60 * 60 * 1_000,
    )
    .await?;
    let token =
        crate::auth::create_account_deletion_token(&state.db, &user.id, now_millis()).await?;
    crate::email::send_auth_email(
        &state.http,
        &state.config,
        &user.email,
        crate::email::AuthEmailPurpose::AccountDeletion,
        &token,
    )
    .await?;
    Ok((
        StatusCode::ACCEPTED,
        [("cache-control", "no-store")],
        Json(AcceptedResponse { accepted: true }),
    ))
}

async fn account_deletion_verify(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
) -> AppResult<Response> {
    if !is_token(&query.token) {
        return redirect(
            &state,
            "/profile?deletion=invalid",
            None,
            StatusCode::SEE_OTHER,
        );
    }
    redirect(
        &state,
        "/delete-account",
        Some(("aaidle_account_deletion", query.token, 5 * 60)),
        StatusCode::SEE_OTHER,
    )
}

async fn account_deletion_complete(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    assert_same_origin(&state, &headers)?;
    let Some(token) = cookie_value(&headers, "aaidle_account_deletion") else {
        return Err(AppError::Validation(
            "This deletion link is invalid or has expired.".to_owned(),
        ));
    };
    if !crate::auth::delete_account_with_token(&state.db, token, now_millis()).await? {
        return Err(AppError::Validation(
            "This deletion link is invalid or has expired.".to_owned(),
        ));
    }
    let mut response_headers = HeaderMap::new();
    response_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response_headers.append(
        header::SET_COOKIE,
        named_cookie_header(&state, "aaidle_account_deletion", "", 0)?,
    );
    response_headers.append(header::SET_COOKIE, cookie_header(&state, "", 0)?);
    Ok((StatusCode::NO_CONTENT, response_headers).into_response())
}

async fn progress_get(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<([(&'static str, &'static str); 1], Json<ProgressResponse>)> {
    let user = authenticated_user(&state, &headers).await?;
    let stored = sqlx::query_scalar::<_, String>(
        "SELECT progress_json FROM user_progress WHERE user_id = ?",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await?;
    let progress = stored
        .map(|value| serde_json::from_str::<Value>(&value))
        .transpose()?
        .map(crate::progress::parse_progress)
        .transpose()?;
    if let Some(progress) = &progress {
        synchronize_progress_records(&state, &user.id, progress).await?;
    }
    Ok((
        [("cache-control", "no-store")],
        Json(ProgressResponse { progress }),
    ))
}

async fn progress_put(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<Value>, JsonRejection>,
) -> AppResult<([(&'static str, &'static str); 1], Json<ProgressResponse>)> {
    assert_same_origin(&state, &headers)?;
    let user = authenticated_user(&state, &headers).await?;
    let incoming = crate::progress::parse_progress(parse_json_payload(payload)?)?;
    let progress = persist_merged_progress(&state, &user.id, incoming).await?;
    synchronize_progress_records(&state, &user.id, &progress).await?;
    Ok((
        [("cache-control", "no-store")],
        Json(ProgressResponse {
            progress: Some(progress),
        }),
    ))
}

async fn persist_merged_progress(
    state: &AppState,
    user_id: &str,
    incoming: Value,
) -> AppResult<Value> {
    for _ in 0..12 {
        let stored = sqlx::query_scalar::<_, String>(
            "SELECT progress_json FROM user_progress WHERE user_id = ?",
        )
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?;
        let progress = match &stored {
            Some(value) => {
                crate::progress::merge_progress(serde_json::from_str(value)?, incoming.clone())?
            }
            None => incoming.clone(),
        };
        let serialized = serde_json::to_string(&progress)?;
        let changed = match stored {
            Some(previous) => sqlx::query(
                "UPDATE user_progress SET progress_json = ?, updated_at = ? \
                 WHERE user_id = ? AND progress_json = ?",
            )
            .bind(&serialized)
            .bind(now_millis())
            .bind(user_id)
            .bind(previous)
            .execute(&state.db)
            .await?
            .rows_affected(),
            None => sqlx::query(
                "INSERT INTO user_progress (user_id, progress_json, updated_at) VALUES (?, ?, ?) \
                 ON CONFLICT(user_id) DO NOTHING",
            )
            .bind(user_id)
            .bind(&serialized)
            .bind(now_millis())
            .execute(&state.db)
            .await?
            .rows_affected(),
        };
        if changed == 1 {
            return Ok(progress);
        }
    }
    Err(AppError::Conflict("PROGRESS_UPDATE_CONFLICT".to_owned()))
}

async fn synchronize_progress_records(
    state: &AppState,
    user_id: &str,
    progress: &Value,
) -> AppResult<()> {
    let now = now_millis();
    let player_id = crate::progress::player_id(progress)?;
    for challenge_id in crate::progress::solved_challenge_ids(progress) {
        sqlx::query(
            "INSERT OR IGNORE INTO user_challenge_completions (user_id, challenge_id, completed_at) \
             SELECT ?, d.id, ? FROM daily_challenges d WHERE d.id = ? AND (\
               (d.mode LIKE 'classic:%' AND EXISTS (\
                 SELECT 1 FROM guess_events g WHERE g.challenge_id = d.id \
                 AND g.player_id = ? AND g.is_correct = 1\
               )) OR (d.mode = 'emoji:family' AND EXISTS (\
                 SELECT 1 FROM emoji_guess_events e WHERE e.challenge_id = d.id \
                 AND e.player_id = ? AND e.is_correct = 1\
               ))\
             )",
        )
        .bind(user_id)
        .bind(now)
        .bind(challenge_id)
        .bind(player_id)
        .bind(player_id)
        .execute(&state.db)
        .await?;
    }
    Ok(())
}

async fn oauth_start(
    State(state): State<AppState>,
    Path(provider): Path<String>,
) -> AppResult<Response> {
    let provider = crate::auth::OAuthProvider::parse(&provider)
        .ok_or_else(|| AppError::NotFound("Unknown OAuth provider.".to_owned()))?;
    let (oauth_state, cookie) =
        crate::auth::create_oauth_state(&state.config.auth_secret, provider)?;
    let url = provider.authorization_url(&state.config, &oauth_state)?;
    redirect(
        &state,
        &url,
        Some(("aaidle_oauth_state", cookie, 10 * 60)),
        StatusCode::FOUND,
    )
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    state: String,
    code: String,
}

async fn oauth_callback(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    headers: HeaderMap,
    Query(query): Query<OAuthCallbackQuery>,
) -> AppResult<Response> {
    let Some(provider) = crate::auth::OAuthProvider::parse(&provider) else {
        return redirect(
            &state,
            "/login?error=oauth",
            Some(("aaidle_oauth_state", "".to_owned(), 0)),
            StatusCode::SEE_OTHER,
        );
    };
    if !crate::auth::is_valid_oauth_state(
        &state.config.auth_secret,
        provider,
        &query.state,
        cookie_value(&headers, "aaidle_oauth_state"),
    )? {
        return redirect(
            &state,
            "/login?error=oauth",
            Some(("aaidle_oauth_state", "".to_owned(), 0)),
            StatusCode::SEE_OTHER,
        );
    }
    let result = async {
        let identity =
            crate::auth::oauth_identity(&state.http, &state.config, provider, &query.code).await?;
        let user =
            crate::auth::find_or_create_oauth_user(&state.db, provider, identity, now_millis())
                .await?;
        if user.disabled {
            return Err(AppError::Forbidden(
                "This account has been disabled.".to_owned(),
            ));
        }
        let session = crate::auth::create_session(&state.db, &user.id, now_millis()).await?;
        Ok::<_, AppError>(session)
    }
    .await;
    match result {
        Ok(session) => oauth_success_redirect(&state, session),
        Err(AppError::Forbidden(_)) => redirect(
            &state,
            "/login?error=account-disabled",
            Some(("aaidle_oauth_state", "".to_owned(), 0)),
            StatusCode::SEE_OTHER,
        ),
        Err(_) => redirect(
            &state,
            "/login?error=oauth",
            Some(("aaidle_oauth_state", "".to_owned(), 0)),
            StatusCode::SEE_OTHER,
        ),
    }
}

fn oauth_success_redirect(state: &AppState, session: String) -> AppResult<Response> {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::LOCATION,
        HeaderValue::from_str(&format!("{}/classic", state.config.app_origin))
            .map_err(|_| AppError::validation("Invalid redirect location."))?,
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.append(
        header::SET_COOKIE,
        named_cookie_header(state, "aaidle_oauth_state", "", 0)?,
    );
    headers.append(
        header::SET_COOKIE,
        cookie_header(state, &session, 30 * 24 * 60 * 60)?,
    );
    Ok((StatusCode::SEE_OTHER, headers).into_response())
}

async fn auth_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<([(&'static str, &'static str); 1], Json<AuthMeResponse>)> {
    let user =
        crate::auth::user_for_session(&state.db, session_cookie(&headers), now_millis()).await?;
    Ok((
        [("cache-control", "no-store")],
        Json(AuthMeResponse {
            user: user.map(auth_user_response),
        }),
    ))
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<([(header::HeaderName, HeaderValue); 2], StatusCode)> {
    assert_same_origin(&state, &headers)?;
    crate::auth::delete_session(&state.db, session_cookie(&headers)).await?;
    Ok((
        [
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
            (header::SET_COOKIE, cookie_header(&state, "", 0)?),
        ],
        StatusCode::NO_CONTENT,
    ))
}

#[derive(Deserialize)]
struct EmojiHintsQuery {
    #[serde(rename = "playerId")]
    player_id: Uuid,
}

async fn emoji_hints(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    Query(query): Query<EmojiHintsQuery>,
) -> AppResult<Json<EmojiHintsResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    Ok(Json(EmojiHintsResponse {
        emoji: repository::emoji_hints(
            &state.db,
            challenge_id,
            query.player_id,
            &state.config.daily_selection_secret,
        )
        .await?,
    }))
}

async fn emoji_guess(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    payload: Result<Json<EmojiGuessRequest>, JsonRejection>,
) -> AppResult<Json<EmojiGuessResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let payload = parse_json_payload(payload)?;
    if !is_model_id(&payload.guessed_family_id) {
        return Err(AppError::validation("guessedFamilyId is invalid"));
    }
    if !(1..=100).contains(&payload.attempt_number) {
        return Err(AppError::validation(
            "attemptNumber must be between 1 and 100",
        ));
    }
    let outcome = repository::process_emoji_guess(
        &state.db,
        EmojiGuessInput {
            challenge_id,
            player_id: payload.player_id,
            request_id: payload.request_id,
            guessed_family_id: payload.guessed_family_id,
            attempt_number: payload.attempt_number,
        },
    )
    .await?;
    Ok(Json(EmojiGuessResponse {
        family: emoji_family_response(outcome.family),
        is_correct: outcome.is_correct,
        attempt_number: outcome.attempt_number,
        global_completion_count: outcome.completion_count,
        player_stats: outcome.player_stats,
        emoji: repository::emoji_hints(
            &state.db,
            challenge_id,
            payload.player_id,
            &state.config.daily_selection_secret,
        )
        .await?,
    }))
}

async fn classic_challenge_stats(
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
) -> AppResult<Json<ChallengeStatsResponse>> {
    let challenge_id = parse_uuid(&challenge_id, "challengeId must be a UUID")?;
    let stats = repository::challenge_stats(&state.db, challenge_id).await?;
    Ok(Json(ChallengeStatsResponse {
        challenge_id,
        total_guesses: stats.total_guesses,
        unique_players: stats.unique_players,
        correct_guesses: stats.correct_guesses,
    }))
}

async fn player_stats(
    State(state): State<AppState>,
    Path(player_id): Path<String>,
) -> AppResult<Json<PlayerStatsResponse>> {
    let player_id = parse_uuid(&player_id, "playerId must be a UUID")?;
    Ok(Json(PlayerStatsResponse {
        player_id,
        stats: repository::player_stats(&state.db, player_id).await?,
    }))
}

fn parse_uuid(value: &str, message: &str) -> AppResult<Uuid> {
    value.parse().map_err(|_| AppError::validation(message))
}

fn is_model_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn format_next_midnight() -> AppResult<String> {
    let tomorrow = OffsetDateTime::now_utc()
        .date()
        .next_day()
        .ok_or_else(|| AppError::Unavailable("Could not determine challenge expiry.".to_owned()))?;
    tomorrow
        .with_hms(0, 0, 0)
        .map_err(|_| AppError::Unavailable("Could not determine challenge expiry.".to_owned()))?
        .assume_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|_| AppError::Unavailable("Could not determine challenge expiry.".to_owned()))
}

fn current_utc_date() -> AppResult<String> {
    OffsetDateTime::now_utc()
        .date()
        .format(DATE_FORMAT)
        .map_err(|_| AppError::Unavailable("Could not determine the current UTC date.".to_owned()))
}

fn emoji_family_response(family: repository::EmojiFamily) -> EmojiFamilyResponse {
    EmojiFamilyResponse {
        id: family.id,
        name: family.name,
        provider_name: family.provider_name,
        representative_model_id: family.representative_model_id,
    }
}

fn auth_user_response(user: crate::auth::SessionUser) -> AuthUserResponse {
    AuthUserResponse {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        email_verified: user.email_verified,
        permission: user.permission.as_str(),
        disabled: user.disabled,
    }
}

async fn authenticated_user(
    state: &AppState,
    headers: &HeaderMap,
) -> AppResult<crate::auth::SessionUser> {
    crate::auth::user_for_session(&state.db, session_cookie(headers), now_millis())
        .await?
        .filter(|user| !user.disabled)
        .ok_or_else(|| AppError::Unauthorized("Sign in to access this game mode.".to_owned()))
}

fn assert_same_origin(state: &AppState, headers: &HeaderMap) -> AppResult<()> {
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    if origin != Some(state.config.app_origin.as_str()) {
        return Err(AppError::Forbidden(
            "This request must come from the application origin.".to_owned(),
        ));
    }
    Ok(())
}

fn session_cookie(headers: &HeaderMap) -> Option<&str> {
    cookie_value(headers, "aaidle_session")
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())?
        .split(';')
        .map(str::trim)
        .find_map(|entry| entry.strip_prefix(&format!("{name}=")))
}

fn no_store_with_cookie(
    state: &AppState,
    token: String,
) -> AppResult<[(header::HeaderName, HeaderValue); 2]> {
    Ok([
        (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        (
            header::SET_COOKIE,
            cookie_header(state, &token, 30 * 24 * 60 * 60)?,
        ),
    ])
}

fn cookie_header(state: &AppState, token: &str, max_age: i64) -> AppResult<HeaderValue> {
    named_cookie_header(state, "aaidle_session", token, max_age)
}

fn named_cookie_header(
    state: &AppState,
    name: &str,
    value: &str,
    max_age: i64,
) -> AppResult<HeaderValue> {
    let secure = if state.config.secure_cookies {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "{name}={value}; Path=/; Max-Age={max_age}; SameSite=Lax; HttpOnly{secure}"
    ))
    .map_err(|_| AppError::config("session cookie could not be encoded"))
}

fn now_millis() -> i64 {
    OffsetDateTime::now_utc()
        .unix_timestamp_nanos()
        .div_euclid(1_000_000) as i64
}

fn redirect(
    state: &AppState,
    location: &str,
    cookie: Option<(&str, String, i64)>,
    status: StatusCode,
) -> AppResult<Response> {
    let location = if location.starts_with("http://") || location.starts_with("https://") {
        location.to_owned()
    } else {
        format!("{}{}", state.config.app_origin, location)
    };
    let mut headers = HeaderMap::new();
    headers.insert(
        header::LOCATION,
        HeaderValue::from_str(&location)
            .map_err(|_| AppError::validation("Invalid redirect location."))?,
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Some((name, value, max_age)) = cookie {
        headers.append(
            header::SET_COOKIE,
            named_cookie_header(state, name, &value, max_age)?,
        );
    }
    Ok((status, headers).into_response())
}

async fn consume_auth_rate_limit(
    state: &AppState,
    headers: &HeaderMap,
    peer: Option<SocketAddr>,
    scope: &str,
    email: &str,
    limit: i64,
    window_millis: i64,
) -> AppResult<()> {
    let client_ip = client_ip_for_request(state.config.environment, headers, peer);
    let subject = crate::auth::rate_limit_subject(&state.config.auth_secret, &client_ip, email)?;
    if !crate::auth::consume_rate_limit(
        &state.db,
        scope,
        &subject,
        limit,
        window_millis,
        now_millis(),
    )
    .await?
    {
        return Err(AppError::TooManyRequests("Try again later.".to_owned()));
    }
    Ok(())
}

fn client_ip_for_request(
    environment: crate::config::AppEnvironment,
    headers: &HeaderMap,
    peer: Option<SocketAddr>,
) -> String {
    let trusted_proxy_ip = matches!(environment, crate::config::AppEnvironment::Production)
        .then(|| {
            headers
                .get("x-aaidle-client-ip")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.trim().parse::<IpAddr>().ok())
        })
        .flatten();

    trusted_proxy_ip
        .map(|value| value.to_string())
        .or_else(|| peer.map(|value| value.ip().to_string()))
        .unwrap_or_else(|| "unknown".to_owned())
}

fn is_token(token: &str) -> bool {
    !token.is_empty()
        && token.len() <= 128
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn parse_json_payload<T>(payload: Result<Json<T>, JsonRejection>) -> AppResult<T> {
    payload
        .map_err(|error| match error {
            JsonRejection::BytesRejection(_) => AppError::PayloadTooLarge,
            _ => AppError::validation("Request body must be valid JSON."),
        })
        .map(|payload| payload.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_known_modes_and_model_ids() {
        assert!(is_model_id("gpt-4o"));
        assert!(!is_model_id("gpt 4o"));
    }

    #[test]
    fn cloudflare_proxied_request_uses_caddys_normalized_client_ip() {
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
                Some("172.20.0.2:43210".parse().expect("Caddy peer")),
            ),
            "203.0.113.10"
        );
    }

    #[test]
    fn spoofed_forwarding_headers_are_ignored_without_caddys_header() {
        let mut headers = HeaderMap::new();
        headers.insert("cf-connecting-ip", HeaderValue::from_static("203.0.113.10"));
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("203.0.113.10, 198.51.100.10"),
        );

        assert_eq!(
            client_ip_for_request(
                crate::config::AppEnvironment::Production,
                &headers,
                Some("172.20.0.2:43210".parse().expect("direct peer")),
            ),
            "172.20.0.2"
        );
    }

    #[test]
    fn local_direct_request_uses_the_socket_peer_not_forwarded_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-aaidle-client-ip",
            HeaderValue::from_static("203.0.113.10"),
        );
        headers.insert("cf-connecting-ip", HeaderValue::from_static("203.0.113.11"));

        assert_eq!(
            client_ip_for_request(
                crate::config::AppEnvironment::Local,
                &headers,
                Some("127.0.0.1:43210".parse().expect("local peer")),
            ),
            "127.0.0.1"
        );
    }

    #[test]
    fn missing_cf_connecting_ip_falls_back_to_the_socket_peer() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.10"));

        assert_eq!(
            client_ip_for_request(
                crate::config::AppEnvironment::Production,
                &headers,
                Some("172.20.0.2:43210".parse().expect("direct peer")),
            ),
            "172.20.0.2"
        );
    }
}
