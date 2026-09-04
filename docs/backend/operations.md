# AIdle API operations

This directory contains the self-hosted Rust backend for AIdle.
It is a small Axum process that exposes only `/api/v1` routes, uses SQLx with SQLite, and keeps all player state in the database.

The API does not serve frontend assets or contain frontend behavior.

## Requirements

Install Rust 1.94 or newer.
The supported database is SQLite.

## Local setup

From the repository root, copy `backend/.env.example` into `backend/.env`.
For a new local database, run:

```bash
cp backend/.env.example backend/.env
cd backend
cargo run --bin seed
cargo run --bin aidle-api
```

The API runs its idempotent SQLx migrations before accepting requests.
The seed command is safe to repeat and imports the existing `data/classic.seed.json` catalog into the normalized SQLite tables.

For the local Docker stack, `make fixture-admin` creates or resets the verified superadmin fixture account `admin@aaidle.com` with password `zaq1@WSX`.
It also enables Hardcore and Inner Circle, populates the account with a primary player and history for every Classic challenge already generated in the database, and sets the Hardcore soundtrack to `https://soundcloud.com/user-348797964/the-only-thing-they-fear-is`.
This fixture is for local development only, and the fixture command refuses to run in production.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AIDLE_BIND_ADDR` | `0.0.0.0:8080` | HTTP listen address |
| `DATABASE_URL` | `sqlite://../data/aidle.db` | SQLite URL when running Rust directly |
| `DAILY_SELECTION_SECRET` | development-only fallback | HMAC secret for deterministic daily selection |
| `AUTH_SECRET` | development-only fallback | Session, OAuth state, and trajectory-token HMAC secret |
| `HEALTH_KEY` | development-only fallback | Secret required in the `x-aaidle-health-key` health-check header |
| `AAIDLE_VERSION` | Cargo package version locally | Deployed release tag reported by authenticated health endpoints |
| `REQUEST_TIMEOUT_SECONDS` | `10` | Per-request timeout |
| `RUST_LOG` | `info` | Structured log filter |

Local development uses `http://localhost:5173` as the application origin.
In production, set `AIDLE_ENV=production`, `APP_ORIGIN`, `AAIDLE_VERSION`, and secrets of at least 32 bytes, including `HEALTH_KEY`.
The service fails before binding if a required secret or release version is missing or invalid.

## SQLite

Connections enable foreign keys, WAL mode, `synchronous=NORMAL`, and a five-second busy timeout.
The API uses a fixed, bounded pool of four connections to serve concurrent Axum requests without unbounded resource use.
Put the database path on a persistent host mount or Docker volume, not the container filesystem.

The migration uses `CREATE TABLE IF NOT EXISTS` for the existing normalized AIdle tables.
It is additive and preserves existing catalog, challenge, player, and guess data.
Model IDs remain text IDs for compatibility with the existing catalog, while public challenge, player, and request identifiers are UUIDs.

## Checks

```bash
cd backend
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cargo build --release
```

The release profile enables thin LTO, one codegen unit, symbol stripping, and abort-on-panic to reduce deployment overhead.
The application intentionally uses the system allocator until profiling provides evidence for a different allocator.

## Docker

Build from the repository root so the seed source is available to the build:

```bash
docker build -f backend/Dockerfile -t aidle-api .
docker run --rm -p 8080:8080 -v aidle_data:/data \
  -e DAILY_SELECTION_SECRET='replace-with-a-real-secret' \
  aidle-api
```

For an empty volume, run `aidle-seed` once in the same image and with the same `/data` volume.
Run the container behind a reverse proxy or CDN that handles TLS and any desired rate limits.
The API does not trust forwarded headers.

### Production security headers

The API adds baseline security headers to every response. The static SPA is served by the
host Caddy instance, so include [`deploy/caddy/aaidle-security.caddy`](../../deploy/caddy/aaidle-security.caddy)
inside the `aaidle.com` site block and reload Caddy. This enables CSP, HSTS, COOP, clickjacking
protection, and a restrictive Permissions Policy for the browser-facing site. The CSP permits
the SoundCloud widget currently used by Hardcore mode; review that allowlist before adding any
new third-party script, frame, or connection.

## Backup and restore

Use SQLite’s backup facility or `VACUUM INTO` rather than copying only the `.db` file while it is being written in WAL mode.
For example, run `sqlite3 /data/aidle.db "VACUUM INTO '/backups/aidle-$(date +%F).db'"` in a maintenance context.
To restore, stop the API, replace the database with the verified backup, remove any matching `-wal` and `-shm` files, then start the API.

## Profiling

The service has no application cache, queues, or background workers.
Optional development tools include `heaptrack`, `valgrind --tool=massif`, `cargo flamegraph`, and `perf`.
Use them outside the container when investigating a real memory or CPU issue.

### Logo image sources

Publish `public/logo-visual/` and shared `public/common/` with the frontend before deploying catalog changes. The backend downloads seed `assetUrl` paths from `APP_ORIGIN`; it no longer embeds Logo image files. Ensure the API container can reach that origin (including any edge access controls). Local development needs Vite running at `APP_ORIGIN` alongside the Rust API.

Downloaded originals are cached in API memory for 24 hours and reused for all reveal variants. Expiration discards the original and its rendered images; a challenge change or API restart clears all Logo image caches. Browser crops expire at the next UTC midnight. Use a new image filename and update the catalog when replacing an original. This changes the server cache key; already-cached browser variants can still remain until the next UTC midnight.

An unavailable source, redirect, timeout, download above 10 MiB, or invalid/oversized decoded image yields a retryable 503 from the Logo image endpoint. Source URLs are not included in error messages. Verify the static file is published and reachable from the API container; restarting cannot repair a missing source file.
