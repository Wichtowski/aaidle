use reqwest::Client;
use serde::Serialize;

use crate::{
    config::AppConfig,
    error::{AppError, AppResult},
};

const SENDER: &str = "aAIdle <accounts@aaidle.com>";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AuthEmailPurpose {
    EmailVerification,
    PasswordReset,
    AccountDeletion,
}

pub struct AuthEmailDelivery {
    pub local_url: Option<String>,
}

impl AuthEmailPurpose {
    fn path(self) -> &'static str {
        match self {
            Self::EmailVerification => "/api/v2/auth/email-verification/verify",
            Self::PasswordReset => "/api/v2/auth/password-reset/verify",
            Self::AccountDeletion => "/api/v2/auth/account-deletion/verify",
        }
    }

    fn subject(self) -> &'static str {
        match self {
            Self::EmailVerification => "Activate your aAIdle account",
            Self::PasswordReset => "Reset your aAIdle password",
            Self::AccountDeletion => "Confirm deletion of your aAIdle account",
        }
    }

    fn action(self) -> &'static str {
        match self {
            Self::EmailVerification => "Activate account",
            Self::PasswordReset => "Reset password",
            Self::AccountDeletion => "Delete account",
        }
    }

    fn expiry(self) -> &'static str {
        match self {
            Self::EmailVerification => "30 minutes",
            Self::PasswordReset => "15 minutes",
            Self::AccountDeletion => "5 minutes",
        }
    }

    fn deletion_warning(self) -> &'static str {
        match self {
            Self::AccountDeletion => " This permanently deletes your account and cannot be undone.",
            _ => "",
        }
    }
}

pub async fn send_auth_email(
    client: &Client,
    config: &AppConfig,
    email: &str,
    purpose: AuthEmailPurpose,
    token: &str,
) -> AppResult<AuthEmailDelivery> {
    let link = format!("{}{}?token={token}", config.app_origin, purpose.path());
    let Some(api_key) = config.resend_api_key.as_deref() else {
        if config.secure_cookies {
            return Err(AppError::Unavailable(
                "Transactional email is not configured.".to_owned(),
            ));
        }
        return Ok(AuthEmailDelivery {
            local_url: Some(link),
        });
    };
    let body = ResendEmail {
        from: SENDER,
        to: vec![email],
        subject: purpose.subject(),
        text: format!(
            "{}: {link}\n\nThis link expires in {}.{}",
            purpose.action(),
            purpose.expiry(),
            purpose.deletion_warning()
        ),
        html: format!(
            "<p><a href=\"{link}\">{}</a></p><p>This link expires in {}.{}</p>",
            purpose.action(),
            purpose.expiry(),
            purpose.deletion_warning()
        ),
    };
    let response = client
        .post("https://api.resend.com/emails")
        .bearer_auth(api_key)
        .header("Idempotency-Key", uuid::Uuid::new_v4().to_string())
        .json(&body)
        .send()
        .await
        .map_err(|_| {
            AppError::Unavailable("Transactional email could not be delivered.".to_owned())
        })?;
    if !response.status().is_success() {
        return Err(AppError::Unavailable(
            "Transactional email could not be delivered.".to_owned(),
        ));
    }
    Ok(AuthEmailDelivery { local_url: None })
}

#[derive(Serialize)]
struct ResendEmail<'a> {
    from: &'a str,
    to: Vec<&'a str>,
    subject: &'a str,
    text: String,
    html: String,
}
