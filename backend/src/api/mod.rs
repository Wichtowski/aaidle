pub mod v1;

use axum::{
    Router,
    http::{HeaderName, HeaderValue, header},
    middleware::{self, Next},
    response::Response,
};

use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .nest("/api/v1", v1::router(state))
        .layer(middleware::from_fn(security_headers))
}

async fn security_headers(request: axum::extract::Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();

    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        HeaderName::from_static("cross-origin-opener-policy"),
        HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        HeaderName::from_static("permissions-policy"),
        HeaderValue::from_static("camera=(), geolocation=(), microphone=()"),
    );

    response
}
