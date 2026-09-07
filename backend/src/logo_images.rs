use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::sync::Mutex;

use crate::{
    domain::logo::{MAX_REVEAL_REVISION, RevealProfile, render_logo_image, valid_asset_url},
    error::{AppError, AppResult},
};

const ORIGINAL_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_SOURCE_BYTES: usize = 10 * 1024 * 1024;

type RenderKey = (String, (u8, u32, u32), usize, bool);

pub struct LogoImageCache {
    asset_root: PathBuf,
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
    pub fn new(asset_root: impl AsRef<Path>) -> AppResult<Self> {
        let asset_root = std::fs::canonicalize(asset_root)
            .ok()
            .filter(|path| path.is_dir())
            .ok_or_else(|| AppError::config("LOGO_ASSET_DIR must be an existing directory"))?;
        Ok(Self {
            asset_root,
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
        // Serialize misses so concurrent requests read an original only once
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
        let transforms_image = profile != RevealProfile::None;
        let key = (
            asset_url.to_owned(),
            profile.cache_key(),
            if transforms_image {
                revision.min(MAX_REVEAL_REVISION)
            } else {
                0
            },
            transforms_image && solved,
        );
        if let Some(image) = cache.rendered.get(&key) {
            return Ok(image.clone());
        }
        let original = if let Some(original) = cache.originals.get(asset_url) {
            original.bytes.clone()
        } else {
            Arc::new(self.read(asset_url).await?)
        };
        let bytes = original.clone();
        let image = tokio::task::spawn_blocking(move || {
            render_logo_image(&bytes, profile, revision, solved)
        })
        .await
        .map_err(|_| AppError::Unavailable("Logo image rendering was interrupted.".to_owned()))??;
        // Failed reads/decodes are not cached; a repaired private file can be retried
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

    async fn read(&self, asset_url: &str) -> AppResult<Vec<u8>> {
        let unavailable = || AppError::Unavailable("Logo source image is unavailable.".to_owned());
        let path = self.asset_root.join(asset_url.trim_start_matches('/'));
        let path = tokio::fs::canonicalize(path)
            .await
            .map_err(|_| unavailable())?;
        if !path.starts_with(&self.asset_root) {
            return Err(unavailable());
        }
        let metadata = tokio::fs::metadata(&path)
            .await
            .map_err(|_| unavailable())?;
        if !metadata.is_file() {
            return Err(unavailable());
        }
        if metadata.len() > MAX_SOURCE_BYTES as u64 {
            return Err(AppError::Unavailable(
                "Logo source image is too large.".to_owned(),
            ));
        }
        let bytes = tokio::fs::read(path).await.map_err(|_| unavailable())?;
        if bytes.len() > MAX_SOURCE_BYTES {
            return Err(AppError::Unavailable(
                "Logo source image is too large.".to_owned(),
            ));
        }
        Ok(bytes)
    }
}

#[cfg(test)]
pub(crate) mod tests;
