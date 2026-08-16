use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::error::{AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug)]
pub struct RecentAnswer {
    pub model_id: String,
    pub challenge_date: String,
}

pub fn select_daily_model(
    date: &str,
    mode: &str,
    selection_version: i64,
    secret: &str,
    model_ids: &[String],
    recent_answers: &[RecentAnswer],
    cooldown_days: usize,
) -> AppResult<String> {
    if model_ids.is_empty() {
        return Err(AppError::Unavailable(
            "No eligible models are available for this mode.".to_owned(),
        ));
    }
    let mut candidates = model_ids.to_vec();
    candidates.sort_unstable();
    candidates.dedup();

    let blocked = recent_answers
        .iter()
        .take(cooldown_days)
        .map(|answer| answer.model_id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    candidates.retain(|id| !blocked.contains(id.as_str()));

    if candidates.is_empty() {
        let mut last_used_by_model = std::collections::BTreeMap::new();
        for answer in recent_answers {
            last_used_by_model
                .entry(answer.model_id.as_str())
                .or_insert(answer.challenge_date.as_str());
        }
        let oldest = model_ids
            .iter()
            .filter_map(|id| last_used_by_model.get(id.as_str()).copied())
            .min()
            .ok_or_else(|| {
                AppError::Unavailable("No eligible models are available for this mode.".to_owned())
            })?;
        candidates = model_ids
            .iter()
            .filter(|id| last_used_by_model.get(id.as_str()) == Some(&oldest))
            .cloned()
            .collect();
        candidates.sort_unstable();
        candidates.dedup();
    }

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppError::config("DAILY_SELECTION_SECRET is invalid"))?;
    mac.update(format!("{date}:{mode}:{selection_version}").as_bytes());
    let digest = mac.finalize().into_bytes();
    let index = u64::from_be_bytes(digest[..8].try_into().expect("SHA-256 digest has 32 bytes"))
        % candidates.len() as u64;
    Ok(candidates[index as usize].clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_is_deterministic_and_excludes_recent_models() {
        let models = vec!["b".to_owned(), "a".to_owned(), "c".to_owned()];
        let selected = select_daily_model(
            "2026-08-15",
            "classic",
            1,
            "a sufficiently long test secret",
            &models,
            &[],
            60,
        )
        .expect("selection succeeds");
        assert_eq!(
            selected,
            select_daily_model(
                "2026-08-15",
                "classic",
                1,
                "a sufficiently long test secret",
                &models,
                &[],
                60
            )
            .expect("selection succeeds")
        );
        let recent = vec![RecentAnswer {
            model_id: selected,
            challenge_date: "2026-08-14".to_owned(),
        }];
        assert_ne!(
            select_daily_model(
                "2026-08-15",
                "classic",
                1,
                "a sufficiently long test secret",
                &models,
                &recent,
                60
            )
            .expect("selection succeeds"),
            recent[0].model_id
        );
    }
}
