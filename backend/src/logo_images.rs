use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use reqwest::{Client, Url, redirect::Policy};
use tokio::sync::Mutex;

use crate::{
    domain::logo::{MAX_REVEAL_REVISION, RevealProfile, render_logo_image, valid_asset_url},
    error::{AppError, AppResult},
};

const ORIGINAL_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_SOURCE_BYTES: usize = 10 * 1024 * 1024;

type RenderKey = (String, (u8, u32, u32), usize, bool);

pub struct LogoImageCache {
    client: Client,
    origin: Url,
    inner: Mutex<CachedImages>,
}

#[derive(Default)]
struct CachedImages {
    challenge_id: String,
    originals: HashMap<String, Original>,
    rendered: HashMap<RenderKey, Vec<u8>>,
}

struct Original {
    bytes: Arc<Vec<u8>>,
    fetched_at: Instant,
}

impl LogoImageCache {
    pub fn new(origin: &str, timeout: Duration) -> AppResult<Self> {
        let origin = Url::parse(origin)
            .ok()
            .filter(|url| {
                matches!(url.scheme(), "http" | "https")
                    && url.host_str().is_some()
                    && url.username().is_empty()
                    && url.password().is_none()
            })
            .ok_or_else(|| {
                AppError::config("APP_ORIGIN must be an HTTP(S) origin for Logo images")
            })?;
        let client = Client::builder()
            .timeout(timeout)
            .redirect(Policy::none())
            .build()
            .map_err(|_| AppError::config("Could not configure Logo image downloads"))?;
        Ok(Self {
            client,
            origin,
            inner: Mutex::new(CachedImages::default()),
        })
    }

    pub async fn image(
        &self,
        challenge_id: &str,
        asset_url: &str,
        profile: RevealProfile,
        revision: usize,
        solved: bool,
    ) -> AppResult<Vec<u8>> {
        if !valid_asset_url(asset_url) {
            return Err(AppError::Unavailable(
                "Logo image URL is invalid.".to_owned(),
            ));
        }
        // Serialize misses so concurrent guesses download an original only once.
        let mut cache = self.inner.lock().await;
        if cache.challenge_id != challenge_id {
            *cache = CachedImages {
                challenge_id: challenge_id.to_owned(),
                ..Default::default()
            };
        }
        if cache
            .originals
            .get(asset_url)
            .is_some_and(|original| original.fetched_at.elapsed() >= ORIGINAL_TTL)
        {
            cache.originals.remove(asset_url);
            cache.rendered.retain(|key, _| key.0 != asset_url);
        }
        let key = (
            asset_url.to_owned(),
            profile.cache_key(),
            revision.min(MAX_REVEAL_REVISION),
            solved,
        );
        if let Some(image) = cache.rendered.get(&key) {
            return Ok(image.clone());
        }
        let original = if let Some(original) = cache.originals.get(asset_url) {
            original.bytes.clone()
        } else {
            let url = self
                .origin
                .join(asset_url)
                .map_err(|_| AppError::Unavailable("Logo image URL is invalid.".to_owned()))?;
            Arc::new(self.download(url).await?)
        };
        let bytes = original.clone();
        let image = tokio::task::spawn_blocking(move || {
            render_logo_image(&bytes, profile, revision, solved)
        })
        .await
        .map_err(|_| AppError::Unavailable("Logo image rendering was interrupted.".to_owned()))??;
        // Failed downloads/decodes are not cached; a repaired public file can be retried.
        cache
            .originals
            .entry(asset_url.to_owned())
            .or_insert_with(|| Original {
                bytes: original,
                fetched_at: Instant::now(),
            });
        cache.rendered.insert(key, image.clone());
        Ok(image)
    }

    async fn download(&self, url: Url) -> AppResult<Vec<u8>> {
        let unavailable =
            || AppError::Unavailable("Logo source image could not be downloaded.".to_owned());
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| unavailable())?;
        if !response.status().is_success() {
            return Err(unavailable());
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_SOURCE_BYTES as u64)
        {
            return Err(AppError::Unavailable(
                "Logo source image is too large.".to_owned(),
            ));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| unavailable())? {
            if chunk.len() > MAX_SOURCE_BYTES - bytes.len() {
                return Err(AppError::Unavailable(
                    "Logo source image is too large.".to_owned(),
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
}

#[cfg(test)]
pub(crate) mod tests;
