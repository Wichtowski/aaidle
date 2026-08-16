pub mod v2;

use axum::Router;

use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new().nest("/api/v2", v2::router(state))
}
