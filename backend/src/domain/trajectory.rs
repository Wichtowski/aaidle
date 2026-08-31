use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::error::{AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

#[derive(Deserialize, Serialize)]
struct TrajectoryAccessPayload<'a> {
    challenge_id: &'a str,
    answer_model_id: &'a str,
}

pub fn create_access_token(
    secret: &str,
    challenge_id: &str,
    answer_model_id: &str,
) -> AppResult<String> {
    let payload = serde_json::to_vec(&TrajectoryAccessPayload {
        challenge_id,
        answer_model_id,
    })?;
    let payload = URL_SAFE_NO_PAD.encode(payload);
    Ok(format!("{payload}.{}", signature(secret, &payload)?))
}

pub fn has_access(
    secret: &str,
    token: Option<&str>,
    challenge_id: &str,
    answer_model_id: &str,
) -> AppResult<bool> {
    let Some((payload, provided_signature)) = token.and_then(|value| value.split_once('.')) else {
        return Ok(false);
    };
    let expected_signature = signature(secret, payload)?;
    if !constant_time_eq(provided_signature.as_bytes(), expected_signature.as_bytes()) {
        return Ok(false);
    }
    let Ok(payload) = URL_SAFE_NO_PAD.decode(payload) else {
        return Ok(false);
    };
    let Ok(payload) = serde_json::from_slice::<TrajectoryAccessPayload<'_>>(&payload) else {
        return Ok(false);
    };
    Ok(payload.challenge_id == challenge_id && payload.answer_model_id == answer_model_id)
}

fn signature(secret: &str, payload: &str) -> AppResult<String> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppError::config("AUTH_SECRET is invalid"))?;
    mac.update(payload.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
            == 0
}

#[cfg(test)]
mod tests;
