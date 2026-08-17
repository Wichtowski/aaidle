use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::{
    config::AppConfig,
    error::{AppError, AppResult},
};

const GITHUB_ISSUES_URL: &str = "https://api.github.com/repos/Wichtowski/aaidle/issues";

#[derive(Serialize)]
struct CreateIssueRequest<'a> {
    title: String,
    body: &'a str,
}

#[derive(Deserialize)]
struct CreateIssueResponse {
    html_url: String,
}

pub async fn create_report(
    http: &Client,
    config: &AppConfig,
    title: &str,
    description: &str,
) -> AppResult<String> {
    let token = config.github_issues_token.as_deref().ok_or_else(|| {
        AppError::Unavailable(
            "Issue reporting is not configured right now. Please try again later.".to_owned(),
        )
    })?;
    let response = http
        .post(GITHUB_ISSUES_URL)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&CreateIssueRequest {
            title: format!("[Report] {title}"),
            body: description,
        })
        .send()
        .await
        .map_err(|error| {
            warn!(error = %error, "GitHub issue creation request failed");
            AppError::Unavailable("Could not send the report. Please try again later.".to_owned())
        })?;
    if !response.status().is_success() {
        warn!(status = %response.status(), "GitHub issue creation was rejected");
        return Err(AppError::Unavailable(
            "Could not send the report. Please try again later.".to_owned(),
        ));
    }
    response
        .json::<CreateIssueResponse>()
        .await
        .map(|issue| issue.html_url)
        .map_err(|error| {
            warn!(error = %error, "GitHub issue response could not be decoded");
            AppError::Unavailable("Could not send the report. Please try again later.".to_owned())
        })
}
