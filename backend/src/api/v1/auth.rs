use axum::{
    Json,
    extract::{ConnectInfo, Path, Query, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::net::SocketAddr;

use crate::{
    dto::{
        AcceptedResponse, AuthMeResponse, AuthenticatedResponse, EmailAcceptedResponse,
        HardcoreStatusResponse, PasswordCredentialsRequest,
    },
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    CLASSIC_CHALLENGE_COMPLETION_CATEGORIES, assert_same_origin, auth_user_response,
    authenticated_user, bearer_token, consume_auth_rate_limit, cookie_header, cookie_value, is_token,
    named_cookie_header, no_store_with_cookie, now_millis, parse_json_payload, redirect,
    session_cookie,
};

pub(super) async fn register(
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

pub(super) async fn password_login(
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
    let session = crate::auth::create_session(&state.db, &user.id, now_millis()).await?;
    let access_token = crate::auth::create_access_token(&user, &state.config, now_millis())?;
    Ok((
        no_store_with_cookie(&state, session)?,
        Json(AuthenticatedResponse {
            user: auth_user_response(user),
            access_token,
        }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EmailRequest {
    email: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PasswordResetCompletionRequest {
    password: String,
}

pub(super) async fn email_verification(
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

pub(super) async fn email_verification_verify(
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

pub(super) async fn password_reset(
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
pub(super) struct TokenQuery {
    token: String,
}

pub(super) async fn password_reset_verify(
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

pub(super) async fn password_reset_complete(
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

pub(super) async fn account_deletion(
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

pub(super) async fn account_deletion_verify(
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

pub(super) async fn account_deletion_complete(
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

pub(super) async fn oauth_start(
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
pub(super) struct OAuthCallbackQuery {
    state: String,
    code: String,
}

pub(super) async fn oauth_callback(
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

pub(super) async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<([(&'static str, &'static str); 1], Json<AuthMeResponse>)> {
    let user = crate::auth::user_for_access_token(
        &state.db,
        bearer_token(&headers),
        &state.config,
    )
    .await?;
    Ok((
        [("cache-control", "no-store")],
        Json(AuthMeResponse {
            user: user.map(auth_user_response),
        }),
    ))
}

pub(super) async fn hardcore_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(
    [(&'static str, &'static str); 1],
    Json<HardcoreStatusResponse>,
)> {
    let user = crate::auth::user_for_access_token(
        &state.db,
        bearer_token(&headers),
        &state.config,
    )
    .await?;
    let Some(user) = user.filter(|user| !user.disabled) else {
        return Ok((
            [("cache-control", "no-store")],
            Json(HardcoreStatusResponse {
                signed_in: false,
                unlocked: false,
                completed_categories: vec![],
                required_categories: CLASSIC_CHALLENGE_COMPLETION_CATEGORIES
                    .iter()
                    .map(|value| (*value).to_owned())
                    .collect(),
            }),
        ));
    };
    let completed_categories = sqlx::query_scalar::<_, String>(
        "SELECT category FROM user_game_progress WHERE user_id = ? AND game_type = 'classic' \
         AND difficulty = 'challenge' ORDER BY category",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;
    Ok((
        [("cache-control", "no-store")],
        Json(HardcoreStatusResponse {
            signed_in: true,
            unlocked: crate::auth::has_hardcore_access(&state.db, &user.id).await?,
            completed_categories,
            required_categories: CLASSIC_CHALLENGE_COMPLETION_CATEGORIES
                .iter()
                .map(|value| (*value).to_owned())
                .collect(),
        }),
    ))
}

pub(super) async fn logout(
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
