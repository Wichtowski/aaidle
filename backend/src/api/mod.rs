pub mod v1;

use axum::Router;

use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new().nest("/api/v1", v1::router(state))
}
