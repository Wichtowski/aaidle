use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use serde::Deserialize;
use serde_json::Value;
use sqlx::FromRow;

use crate::{
    dto::{
        AdminCompletion, AdminDeleteGuessRequest, AdminUserDetail, AdminUserDetailResponse,
        AdminUserSummary, AdminUserUpdateRequest, AdminUsersResponse, PublicConfigResponse,
        SoundtrackResponse, SoundtrackUpdateRequest,
    },
    error::{AppError, AppResult},
    state::AppState,
};

use super::{assert_csrf, assert_same_origin, now_millis, parse_json_payload, session_cookie};

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
pub(super) struct AdminUsersQuery {
    page: Option<i64>,
    query: Option<String>,
}

pub(super) async fn users(
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

pub(super) async fn user_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> AppResult<Json<AdminUserDetailResponse>> {
    admin_user_for_request(&state, &headers, false).await?;
    let user = load_admin_user_detail(&state, &user_id).await?;
    Ok(Json(AdminUserDetailResponse { user }))
}

pub(super) async fn user_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    payload: Result<Json<AdminUserUpdateRequest>, JsonRejection>,
) -> AppResult<Json<AdminUserDetailResponse>> {
    let administrator = admin_user_for_request(&state, &headers, true).await?;
    assert_same_origin(&state, &headers)?;
    assert_csrf(&headers)?;
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
    if payload.disabled != Some(true) {
        sqlx::query("DELETE FROM user_sessions WHERE user_id = ?")
            .bind(&user_id)
            .execute(&mut *transaction)
            .await?;
    }
    transaction.commit().await?;
    Ok(Json(AdminUserDetailResponse {
        user: load_admin_user_detail(&state, &user_id).await?,
    }))
}

pub(super) async fn delete_guess(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    payload: Result<Json<AdminDeleteGuessRequest>, JsonRejection>,
) -> AppResult<Json<AdminUserDetailResponse>> {
    let administrator = admin_user_for_request(&state, &headers, true).await?;
    assert_same_origin(&state, &headers)?;
    assert_csrf(&headers)?;
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
        .bind(&challenge_id)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(Json(AdminUserDetailResponse {
        user: load_admin_user_detail(&state, &user_id).await?,
    }))
}

pub(super) async fn hardcore_soundtrack(
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

pub(super) async fn update_hardcore_soundtrack(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<SoundtrackUpdateRequest>, JsonRejection>,
) -> AppResult<Json<SoundtrackResponse>> {
    admin_user_for_request(&state, &headers, true).await?;
    assert_same_origin(&state, &headers)?;
    assert_csrf(&headers)?;
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

pub(super) async fn public_config(
    State(state): State<AppState>,
) -> AppResult<Json<PublicConfigResponse>> {
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
