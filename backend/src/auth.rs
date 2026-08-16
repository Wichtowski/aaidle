use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use reqwest::{Client, Url};
use scrypt::{Params, scrypt};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{SqlitePool, Transaction};
use uuid::Uuid;

use crate::{
    config::{AppConfig, OAuthClientConfig},
    error::{AppError, AppResult},
};

const PASSWORD_KEY_LENGTH: usize = 64;
const SESSION_LIFETIME_MILLIS: i64 = 30 * 24 * 60 * 60 * 1_000;
const EMAIL_VERIFICATION_LIFETIME_MILLIS: i64 = 30 * 60 * 1_000;
const PASSWORD_RESET_LIFETIME_MILLIS: i64 = 15 * 60 * 1_000;
const ACCOUNT_DELETION_LIFETIME_MILLIS: i64 = 5 * 60 * 1_000;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionUser {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub email_verified: bool,
    pub permission: Permission,
    pub disabled: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Permission {
    User,
    Developer,
    Superadmin,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OAuthProvider {
    Github,
    Google,
}

impl OAuthProvider {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "github" => Some(Self::Github),
            "google" => Some(Self::Google),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Github => "github",
            Self::Google => "google",
        }
    }

    fn credentials(self, config: &AppConfig) -> AppResult<&OAuthClientConfig> {
        match self {
            Self::Github => config.github_oauth.as_ref(),
            Self::Google => config.google_oauth.as_ref(),
        }
        .ok_or_else(|| AppError::Unavailable("This sign-in provider is not configured.".to_owned()))
    }

    fn callback_url(self, config: &AppConfig) -> String {
        format!(
            "{}/api/v2/auth/oauth/{}/callback",
            config.app_origin,
            self.as_str()
        )
    }

    pub fn authorization_url(self, config: &AppConfig, state: &str) -> AppResult<String> {
        let credentials = self.credentials(config)?;
        let endpoint = match self {
            Self::Github => "https://github.com/login/oauth/authorize",
            Self::Google => "https://accounts.google.com/o/oauth2/v2/auth",
        };
        let mut url = Url::parse(endpoint)
            .map_err(|_| AppError::Unavailable("Could not start sign-in.".to_owned()))?;
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("client_id", &credentials.client_id);
            query.append_pair("redirect_uri", &self.callback_url(config));
            query.append_pair("state", state);
            match self {
                Self::Github => {
                    query.append_pair("scope", "read:user user:email");
                }
                Self::Google => {
                    query.append_pair("response_type", "code");
                    query.append_pair("scope", "openid email profile");
                    query.append_pair("access_type", "online");
                    query.append_pair("prompt", "select_account");
                }
            }
        }
        Ok(url.into())
    }
}

pub struct OAuthIdentity {
    pub provider_user_id: String,
    pub email: String,
    pub display_name: Option<String>,
}

impl Permission {
    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "user" => Ok(Self::User),
            "developer" => Ok(Self::Developer),
            "superadmin" => Ok(Self::Superadmin),
            _ => Err(AppError::Unavailable(
                "Stored account permission is invalid.".to_owned(),
            )),
        }
    }

    pub fn can_manage_users(self) -> bool {
        matches!(self, Self::Developer | Self::Superadmin)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Developer => "developer",
            Self::Superadmin => "superadmin",
        }
    }

    pub fn can_manage_administrators(self) -> bool {
        matches!(self, Self::Superadmin)
    }
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: String,
    email: String,
    display_name: Option<String>,
    password_hash: Option<String>,
    email_verified_at: Option<i64>,
    permission: String,
    disabled_at: Option<i64>,
}

impl TryFrom<UserRow> for SessionUser {
    type Error = AppError;

    fn try_from(value: UserRow) -> AppResult<Self> {
        Ok(Self {
            id: value.id,
            email: value.email,
            display_name: value.display_name,
            email_verified: value.email_verified_at.is_some(),
            permission: Permission::parse(&value.permission)?,
            disabled: value.disabled_at.is_some(),
        })
    }
}

pub fn normalize_email(email: &str) -> AppResult<String> {
    let normalized = email.trim().to_ascii_lowercase();
    let Some((local, domain)) = normalized.rsplit_once('@') else {
        return Err(AppError::validation("Enter a valid email address."));
    };
    if normalized.len() > 254
        || local.is_empty()
        || local.len() > 64
        || domain.is_empty()
        || !domain.contains('.')
        || normalized.chars().any(char::is_whitespace)
    {
        return Err(AppError::validation("Enter a valid email address."));
    }
    Ok(normalized)
}

pub fn validate_password(password: &str, minimum_length: usize) -> AppResult<()> {
    if !(minimum_length..=128).contains(&password.chars().count()) {
        return Err(AppError::validation(format!(
            "Password must be between {minimum_length} and 128 characters."
        )));
    }
    Ok(())
}

pub fn random_token() -> String {
    let mut bytes = [0_u8; 32];
    bytes[..16].copy_from_slice(Uuid::new_v4().as_bytes());
    bytes[16..].copy_from_slice(Uuid::new_v4().as_bytes());
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn token_hash(token: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(token.as_bytes()))
}

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = URL_SAFE_NO_PAD.encode(Uuid::new_v4().as_bytes());
    let mut output = [0_u8; PASSWORD_KEY_LENGTH];
    scrypt(
        password.as_bytes(),
        salt.as_bytes(),
        &scrypt_params()?,
        &mut output,
    )
    .map_err(|_| AppError::Unavailable("Password hashing failed.".to_owned()))?;
    Ok(format!("scrypt${salt}${}", URL_SAFE_NO_PAD.encode(output)))
}

pub fn verify_password(password: &str, encoded: &str) -> AppResult<bool> {
    let Some((algorithm, remainder)) = encoded.split_once('$') else {
        return Ok(false);
    };
    let Some((salt, saved_hash)) = remainder.split_once('$') else {
        return Ok(false);
    };
    if algorithm != "scrypt" || salt.is_empty() {
        return Ok(false);
    }
    let Ok(expected) = URL_SAFE_NO_PAD.decode(saved_hash) else {
        return Ok(false);
    };
    if expected.len() != PASSWORD_KEY_LENGTH {
        return Ok(false);
    }
    let mut actual = [0_u8; PASSWORD_KEY_LENGTH];
    scrypt(
        password.as_bytes(),
        salt.as_bytes(),
        &scrypt_params()?,
        &mut actual,
    )
    .map_err(|_| AppError::Unavailable("Password verification failed.".to_owned()))?;
    Ok(constant_time_eq(&expected, &actual))
}

pub fn rate_limit_subject(
    auth_secret: &str,
    client_ip: &str,
    normalized_email: &str,
) -> AppResult<String> {
    let mut mac = HmacSha256::new_from_slice(auth_secret.as_bytes())
        .map_err(|_| AppError::config("AUTH_SECRET is invalid"))?;
    mac.update(format!("{client_ip}:{normalized_email}").as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
}

pub fn create_oauth_state(
    auth_secret: &str,
    provider: OAuthProvider,
) -> AppResult<(String, String)> {
    let state = random_token();
    let signature = oauth_state_signature(auth_secret, provider, &state)?;
    Ok((
        state.clone(),
        format!("{}.{}.{}", provider.as_str(), state, signature),
    ))
}

pub fn is_valid_oauth_state(
    auth_secret: &str,
    provider: OAuthProvider,
    state: &str,
    cookie: Option<&str>,
) -> AppResult<bool> {
    let Some(cookie) = cookie else {
        return Ok(false);
    };
    let mut parts = cookie.split('.');
    let (Some(cookie_provider), Some(cookie_state), Some(signature), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Ok(false);
    };
    if cookie_provider != provider.as_str() || cookie_state != state {
        return Ok(false);
    }
    let expected = oauth_state_signature(auth_secret, provider, state)?;
    Ok(constant_time_eq(signature.as_bytes(), expected.as_bytes()))
}

fn oauth_state_signature(
    auth_secret: &str,
    provider: OAuthProvider,
    state: &str,
) -> AppResult<String> {
    let mut mac = HmacSha256::new_from_slice(auth_secret.as_bytes())
        .map_err(|_| AppError::config("AUTH_SECRET is invalid"))?;
    mac.update(format!("{}:{state}", provider.as_str()).as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
}

pub async fn consume_rate_limit(
    pool: &SqlitePool,
    scope: &str,
    subject_hash: &str,
    limit: i64,
    window_millis: i64,
    now: i64,
) -> AppResult<bool> {
    let threshold = now - window_millis;
    Ok(sqlx::query_scalar::<_, i64>(
        "INSERT INTO auth_rate_limits (scope, subject_hash, window_started_at, count) VALUES (?, ?, ?, 1) \
         ON CONFLICT(scope, subject_hash) DO UPDATE SET \
         window_started_at = CASE WHEN auth_rate_limits.window_started_at <= ? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END, \
         count = CASE WHEN auth_rate_limits.window_started_at <= ? THEN 1 ELSE auth_rate_limits.count + 1 END \
         WHERE auth_rate_limits.window_started_at <= ? OR auth_rate_limits.count < ? RETURNING count",
    )
    .bind(scope)
    .bind(subject_hash)
    .bind(now)
    .bind(threshold)
    .bind(threshold)
    .bind(threshold)
    .bind(limit)
    .fetch_optional(pool)
    .await?
    .is_some())
}

pub async fn register_with_password(
    pool: &SqlitePool,
    email: &str,
    password: &str,
    now: i64,
) -> AppResult<SessionUser> {
    let email = normalize_email(email)?;
    validate_password(password, 12)?;
    let user_id = Uuid::new_v4().to_string();
    let password_hash = hash_password(password)?;
    let inserted = sqlx::query(
        "INSERT INTO users (id, email, email_normalized, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) \
         ON CONFLICT(email_normalized) DO NOTHING",
    )
    .bind(&user_id)
    .bind(&email)
    .bind(&email)
    .bind(password_hash)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Err(AppError::Conflict("ACCOUNT_EXISTS".to_owned()));
    }
    Ok(SessionUser {
        id: user_id,
        email,
        display_name: None,
        email_verified: false,
        permission: Permission::User,
        disabled: false,
    })
}

pub async fn authenticate_with_password(
    pool: &SqlitePool,
    email: &str,
    password: &str,
) -> AppResult<SessionUser> {
    validate_password(password, 1)?;
    let email = normalize_email(email)?;
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, display_name, password_hash, email_verified_at, permission, disabled_at \
         FROM users WHERE email_normalized = ?",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;
    let Some(user) = user else {
        return Err(AppError::Unauthorized(
            "Email or password is incorrect.".to_owned(),
        ));
    };
    let Some(password_hash) = user.password_hash.as_deref() else {
        return Err(AppError::Unauthorized(
            "Email or password is incorrect.".to_owned(),
        ));
    };
    if !verify_password(password, password_hash)? {
        return Err(AppError::Unauthorized(
            "Email or password is incorrect.".to_owned(),
        ));
    }
    let user = SessionUser::try_from(user)?;
    if user.disabled {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    Ok(user)
}

pub async fn create_session(pool: &SqlitePool, user_id: &str, now: i64) -> AppResult<String> {
    let active = sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND disabled_at IS NULL)",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    if active == 0 {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    let token = random_token();
    sqlx::query(
        "INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(user_id)
    .bind(token_hash(&token))
    .bind(now + SESSION_LIFETIME_MILLIS)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(token)
}

pub async fn create_email_verification_token(
    pool: &SqlitePool,
    user_id: &str,
    now: i64,
) -> AppResult<String> {
    create_auth_email_token(
        pool,
        user_id,
        "email-verification",
        EMAIL_VERIFICATION_LIFETIME_MILLIS,
        now,
    )
    .await
}

pub async fn create_email_verification_token_for_email(
    pool: &SqlitePool,
    email: &str,
    now: i64,
) -> AppResult<Option<(String, String)>> {
    let email = normalize_email(email)?;
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, display_name, password_hash, email_verified_at, permission, disabled_at FROM users WHERE email_normalized = ?",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;
    match user {
        Some(user) if user.email_verified_at.is_none() => Ok(Some((
            user.email,
            create_email_verification_token(pool, &user.id, now).await?,
        ))),
        _ => Ok(None),
    }
}

pub async fn create_password_reset_token(
    pool: &SqlitePool,
    email: &str,
    now: i64,
) -> AppResult<Option<(String, String)>> {
    let email = normalize_email(email)?;
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, display_name, password_hash, email_verified_at, permission, disabled_at FROM users WHERE email_normalized = ?",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;
    match user {
        Some(user) => Ok(Some((
            user.email,
            create_auth_email_token(
                pool,
                &user.id,
                "password-reset",
                PASSWORD_RESET_LIFETIME_MILLIS,
                now,
            )
            .await?,
        ))),
        None => Ok(None),
    }
}

pub async fn create_account_deletion_token(
    pool: &SqlitePool,
    user_id: &str,
    now: i64,
) -> AppResult<String> {
    create_auth_email_token(
        pool,
        user_id,
        "account-deletion",
        ACCOUNT_DELETION_LIFETIME_MILLIS,
        now,
    )
    .await
}

async fn create_auth_email_token(
    pool: &SqlitePool,
    user_id: &str,
    purpose: &str,
    lifetime_millis: i64,
    now: i64,
) -> AppResult<String> {
    let token = random_token();
    let mut transaction = pool.begin().await?;
    sqlx::query("DELETE FROM auth_email_tokens WHERE user_id = ? AND purpose = ?")
        .bind(user_id)
        .bind(purpose)
        .execute(&mut *transaction)
        .await?;
    sqlx::query(
        "INSERT INTO auth_email_tokens (id, user_id, token_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(user_id)
    .bind(token_hash(&token))
    .bind(purpose)
    .bind(now + lifetime_millis)
    .bind(now)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok(token)
}

pub async fn verify_email_address(pool: &SqlitePool, token: &str, now: i64) -> AppResult<bool> {
    let mut transaction = pool.begin().await?;
    let Some(user_id) =
        consume_auth_email_token(&mut transaction, token, "email-verification", now).await?
    else {
        return Ok(false);
    };
    sqlx::query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(now)
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(true)
}

pub async fn reset_password_with_token(
    pool: &SqlitePool,
    token: &str,
    password: &str,
    now: i64,
) -> AppResult<Option<String>> {
    validate_password(password, 12)?;
    let password_hash = hash_password(password)?;
    let mut transaction = pool.begin().await?;
    let Some(user_id) =
        consume_auth_email_token(&mut transaction, token, "password-reset", now).await?
    else {
        return Ok(None);
    };
    sqlx::query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(password_hash)
        .bind(now)
        .bind(&user_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM user_sessions WHERE user_id = ?")
        .bind(&user_id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(Some(user_id))
}

pub async fn delete_account_with_token(
    pool: &SqlitePool,
    token: &str,
    now: i64,
) -> AppResult<bool> {
    Ok(sqlx::query_scalar::<_, String>(
        "DELETE FROM users WHERE id = (SELECT user_id FROM auth_email_tokens WHERE token_hash = ? AND purpose = 'account-deletion' AND expires_at > ?) RETURNING id",
    )
    .bind(token_hash(token))
    .bind(now)
    .fetch_optional(pool)
    .await?
    .is_some())
}

async fn consume_auth_email_token(
    transaction: &mut Transaction<'_, sqlx::Sqlite>,
    token: &str,
    purpose: &str,
    now: i64,
) -> AppResult<Option<String>> {
    Ok(sqlx::query_scalar::<_, String>(
        "DELETE FROM auth_email_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ? RETURNING user_id",
    )
    .bind(token_hash(token))
    .bind(purpose)
    .bind(now)
    .fetch_optional(&mut **transaction)
    .await?)
}

pub async fn find_or_create_oauth_user(
    pool: &SqlitePool,
    provider: OAuthProvider,
    identity: OAuthIdentity,
    now: i64,
) -> AppResult<SessionUser> {
    let normalized_email = normalize_email(&identity.email)?;
    let mut transaction = pool.begin().await?;
    if let Some(user) = sqlx::query_as::<_, UserRow>(
        "SELECT u.id, u.email, u.display_name, u.password_hash, u.email_verified_at, u.permission, u.disabled_at FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.provider_user_id = ?",
    )
    .bind(provider.as_str())
    .bind(&identity.provider_user_id)
    .fetch_optional(&mut *transaction)
    .await? {
        transaction.commit().await?;
        return SessionUser::try_from(user);
    }
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, display_name, password_hash, email_verified_at, permission, disabled_at FROM users WHERE email_normalized = ?",
    )
    .bind(&normalized_email)
    .fetch_optional(&mut *transaction)
    .await?;
    let user = match user {
        Some(user) => {
            sqlx::query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), display_name = COALESCE(display_name, ?), updated_at = ? WHERE id = ?")
                .bind(now)
                .bind(&identity.display_name)
                .bind(now)
                .bind(&user.id)
                .execute(&mut *transaction)
                .await?;
            user.id
        }
        None => {
            let user_id = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO users (id, email, email_normalized, display_name, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .bind(&user_id)
                .bind(&normalized_email)
                .bind(&normalized_email)
                .bind(&identity.display_name)
                .bind(now)
                .bind(now)
                .bind(now)
                .execute(&mut *transaction)
                .await?;
            user_id
        }
    };
    sqlx::query("INSERT INTO user_identities (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(provider.as_str())
        .bind(&identity.provider_user_id)
        .bind(&user)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
    let result = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, display_name, password_hash, email_verified_at, permission, disabled_at FROM users WHERE id = ?",
    )
    .bind(&user)
    .fetch_one(&mut *transaction)
    .await?;
    transaction.commit().await?;
    SessionUser::try_from(result)
}

pub async fn oauth_identity(
    client: &Client,
    config: &AppConfig,
    provider: OAuthProvider,
    code: &str,
) -> AppResult<OAuthIdentity> {
    if code.is_empty() || code.len() > 2048 {
        return Err(AppError::validation(
            "The OAuth authorization code is invalid.",
        ));
    }
    let credentials = provider.credentials(config)?;
    let endpoint = match provider {
        OAuthProvider::Github => "https://github.com/login/oauth/access_token",
        OAuthProvider::Google => "https://oauth2.googleapis.com/token",
    };
    let redirect_uri = provider.callback_url(config);
    let mut form = vec![
        ("client_id", credentials.client_id.as_str()),
        ("client_secret", credentials.client_secret.as_str()),
        ("code", code),
        ("redirect_uri", redirect_uri.as_str()),
    ];
    if provider == OAuthProvider::Google {
        form.push(("grant_type", "authorization_code"));
    }
    let token = client
        .post(endpoint)
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .map_err(|_| {
            AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
        })?;
    if !token.status().is_success() {
        return Err(AppError::Unavailable(
            "OAuth sign-in is temporarily unavailable.".to_owned(),
        ));
    }
    let token = token.json::<OAuthTokenResponse>().await.map_err(|_| {
        AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
    })?;
    let access_token = token.access_token.ok_or_else(|| {
        AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
    })?;
    match provider {
        OAuthProvider::Github => github_identity(client, &access_token).await,
        OAuthProvider::Google => google_identity(client, &access_token).await,
    }
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct GithubProfile {
    id: Option<u64>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct GithubEmail {
    email: Option<String>,
    primary: Option<bool>,
    verified: Option<bool>,
}

#[derive(Deserialize)]
struct GoogleProfile {
    sub: Option<String>,
    email: Option<String>,
    email_verified: Option<bool>,
    name: Option<String>,
}

async fn github_identity(client: &Client, access_token: &str) -> AppResult<OAuthIdentity> {
    let profile = client
        .get("https://api.github.com/user")
        .bearer_auth(access_token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|_| {
            AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
        })?;
    if !profile.status().is_success() {
        return Err(AppError::Unavailable(
            "OAuth sign-in is temporarily unavailable.".to_owned(),
        ));
    }
    let profile = profile.json::<GithubProfile>().await.map_err(|_| {
        AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
    })?;
    let id = profile.id.ok_or_else(|| {
        AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
    })?;
    let emails = client
        .get("https://api.github.com/user/emails")
        .bearer_auth(access_token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|_| {
            AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
        })?;
    if !emails.status().is_success() {
        return Err(AppError::Unavailable(
            "OAuth sign-in is temporarily unavailable.".to_owned(),
        ));
    }
    let email = emails
        .json::<Vec<GithubEmail>>()
        .await
        .map_err(|_| AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned()))?
        .into_iter()
        .find(|entry| entry.primary == Some(true) && entry.verified == Some(true))
        .and_then(|entry| entry.email)
        .ok_or_else(|| {
            AppError::Validation("A verified primary GitHub email address is required.".to_owned())
        })?;
    Ok(OAuthIdentity {
        provider_user_id: id.to_string(),
        email,
        display_name: profile.name,
    })
}

async fn google_identity(client: &Client, access_token: &str) -> AppResult<OAuthIdentity> {
    let response = client
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|_| {
            AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
        })?;
    if !response.status().is_success() {
        return Err(AppError::Unavailable(
            "OAuth sign-in is temporarily unavailable.".to_owned(),
        ));
    }
    let profile = response.json::<GoogleProfile>().await.map_err(|_| {
        AppError::Unavailable("OAuth sign-in is temporarily unavailable.".to_owned())
    })?;
    match (profile.sub, profile.email, profile.email_verified) {
        (Some(provider_user_id), Some(email), Some(true)) => Ok(OAuthIdentity {
            provider_user_id,
            email,
            display_name: profile.name,
        }),
        _ => Err(AppError::Unavailable(
            "OAuth sign-in is temporarily unavailable.".to_owned(),
        )),
    }
}

pub async fn delete_session(pool: &SqlitePool, token: Option<&str>) -> AppResult<()> {
    let Some(token) = token else {
        return Ok(());
    };
    sqlx::query("DELETE FROM user_sessions WHERE token_hash = ?")
        .bind(token_hash(token))
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn user_for_session(
    pool: &SqlitePool,
    token: Option<&str>,
    now: i64,
) -> AppResult<Option<SessionUser>> {
    let Some(token) = token else {
        return Ok(None);
    };
    let token_hash = token_hash(token);
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT u.id, u.email, u.display_name, u.password_hash, u.email_verified_at, u.permission, u.disabled_at \
         FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .bind(&token_hash)
    .bind(now)
    .fetch_optional(pool)
    .await?;
    if user.is_some() {
        sqlx::query("UPDATE user_sessions SET last_seen_at = ? WHERE token_hash = ?")
            .bind(now)
            .bind(token_hash)
            .execute(pool)
            .await?;
    }
    user.map(SessionUser::try_from).transpose()
}

pub async fn has_hardcore_access(pool: &SqlitePool, user_id: &str) -> AppResult<bool> {
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM user_hardcore_access WHERE user_id = ?)",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?
        != 0)
}

pub async fn grant_hardcore_access(pool: &SqlitePool, user_id: &str, now: i64) -> AppResult<()> {
    sqlx::query("INSERT OR IGNORE INTO user_hardcore_access (user_id, unlocked_at) VALUES (?, ?)")
        .bind(user_id)
        .bind(now)
        .execute(pool)
        .await?;
    Ok(())
}

fn scrypt_params() -> AppResult<Params> {
    Params::new(14, 8, 1, PASSWORD_KEY_LENGTH)
        .map_err(|_| AppError::config("scrypt parameters are invalid"))
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_the_node_scrypt_wire_format() {
        let encoded = "scrypt$MDEyMzQ1Njc4OWFiY2RlZg$jIxrBpYgB3uwp7ZZJbAJ19YSarZPKgAllt1cuxPd2HTJJ5AC2msS8rmQa4_Rm2n9o7uFNx3zKKNbcAysD1fpHg";
        assert!(verify_password("correct horse battery staple", encoded).expect("verify password"));
        assert!(!verify_password("incorrect", encoded).expect("verify password"));
    }

    #[test]
    fn hashes_passwords_with_a_verifiable_legacy_format() {
        let encoded = hash_password("correct horse battery staple").expect("hash password");
        assert!(encoded.starts_with("scrypt$"));
        assert!(
            verify_password("correct horse battery staple", &encoded).expect("verify password")
        );
    }

    #[test]
    fn oauth_state_is_bound_to_the_provider_and_is_tamper_evident() {
        let secret = "test secret that is longer than thirty two bytes";
        let (state, cookie) = create_oauth_state(secret, OAuthProvider::Github).expect("state");
        assert!(
            is_valid_oauth_state(secret, OAuthProvider::Github, &state, Some(&cookie))
                .expect("valid state")
        );
        assert!(
            !is_valid_oauth_state(secret, OAuthProvider::Google, &state, Some(&cookie))
                .expect("wrong provider")
        );
        assert!(
            !is_valid_oauth_state(secret, OAuthProvider::Github, "different", Some(&cookie))
                .expect("wrong state")
        );
    }
}
