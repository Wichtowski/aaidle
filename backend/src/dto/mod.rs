use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::domain::comparison::ComparisonResult;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub api_version: &'static str,
    pub version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PasswordCredentialsRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUserResponse {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub email_verified: bool,
    pub permission: &'static str,
    pub disabled: bool,
}

#[derive(Serialize)]
pub struct AuthMeResponse {
    pub user: Option<AuthUserResponse>,
}

#[derive(Serialize)]
pub struct AuthenticatedResponse {
    pub user: AuthUserResponse,
}

#[derive(Serialize)]
pub struct AcceptedResponse {
    pub accepted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailAcceptedResponse {
    pub accepted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activation_url: Option<String>,
}

#[derive(Serialize)]
pub struct ProgressResponse {
    pub progress: Option<Value>,
}

#[derive(Serialize)]
pub struct HardcoreAccessResponse {
    pub unlocked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUserSummary {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub email_verified_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub permission: &'static str,
    pub disabled_at: Option<i64>,
    pub disabled_reason: Option<String>,
    pub sign_in_providers: Vec<String>,
    pub last_seen_at: Option<i64>,
    pub progress_updated_at: Option<i64>,
    pub completion_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUsersResponse {
    pub users: Vec<AdminUserSummary>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminCompletion {
    pub challenge_id: String,
    pub challenge_date: String,
    pub mode: String,
    pub answer_model_name: String,
    pub completed_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUserDetail {
    #[serde(flatten)]
    pub user: AdminUserSummary,
    pub disabled_by_email: Option<String>,
    pub hardcore_unlocked: bool,
    pub progress: Option<Value>,
    pub completions: Vec<AdminCompletion>,
}

#[derive(Serialize)]
pub struct AdminUserDetailResponse {
    pub user: AdminUserDetail,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdminUserUpdateRequest {
    pub permission: Option<AdminAssignablePermission>,
    pub disabled: Option<bool>,
    pub disabled_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AdminAssignablePermission {
    User,
    Developer,
}

impl AdminAssignablePermission {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Developer => "developer",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdminDeleteGuessRequest {
    pub game_key: String,
    pub request_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SoundtrackUpdateRequest {
    pub url: String,
}

#[derive(Serialize)]
pub struct SoundtrackResponse {
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfigResponse {
    pub hardcore_soundtrack_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsResponse {
    pub models: Vec<PublicModel>,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicModel {
    pub id: String,
    pub name: String,
    pub provider_name: String,
    pub family_name: Option<String>,
    pub aliases: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicChallenge {
    pub id: Uuid,
    pub date: String,
    pub mode: String,
    pub expires_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuessRequest {
    pub player_id: Uuid,
    pub request_id: Uuid,
    pub guessed_model_id: String,
    pub attempt_number: u16,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuessedModel {
    pub id: String,
    pub name: String,
    pub provider: Option<String>,
    pub family: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuessResponse {
    pub guessed_model: GuessedModel,
    pub comparison: BTreeMap<String, ComparisonResult>,
    pub is_correct: bool,
    pub attempt_number: u16,
    pub player_stats: PlayerModeStats,
    pub global_completion_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trajectory_access_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrajectoryRequest {
    pub trajectory_access_token: Option<String>,
}

#[derive(Serialize)]
pub struct TrajectoryResponse {
    pub models: Vec<PublicModel>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicGameResponse {
    pub challenge: PublicChallenge,
    pub models: Vec<PublicModel>,
    pub columns: Vec<&'static str>,
    pub global_completion_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiFamilyResponse {
    pub id: String,
    pub name: String,
    pub provider_name: String,
    pub representative_model_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiGameResponse {
    pub challenge: PublicEmojiChallenge,
    pub families: Vec<EmojiFamilyResponse>,
    pub global_completion_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicEmojiChallenge {
    pub id: Uuid,
    pub date: String,
    pub mode: &'static str,
    pub expires_at: String,
    pub initial_emoji: Vec<String>,
    pub maximum_emoji: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmojiGuessRequest {
    pub player_id: Uuid,
    pub request_id: Uuid,
    pub guessed_family_id: String,
    pub attempt_number: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiGuessResponse {
    pub family: EmojiFamilyResponse,
    pub is_correct: bool,
    pub attempt_number: u16,
    pub global_completion_count: i64,
    pub player_stats: PlayerModeStats,
    pub emoji: Vec<String>,
}

#[derive(Serialize)]
pub struct EmojiHintsResponse {
    pub emoji: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerModeStats {
    pub mode: String,
    pub current_streak: i64,
    pub best_streak: i64,
    pub games_played: i64,
    pub games_won: i64,
    pub last_played_date: Option<String>,
    pub last_solved_date: Option<String>,
    pub guess_distribution: BTreeMap<String, i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStatsResponse {
    pub player_id: Uuid,
    pub stats: Vec<PlayerModeStats>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeStatsResponse {
    pub challenge_id: Uuid,
    pub total_guesses: i64,
    pub unique_players: i64,
    pub correct_guesses: i64,
}
