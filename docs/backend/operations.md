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

For the local Docker stack, `make fixture-admin` creates or resets the verified superadmin fixture account `admin@test.com` with password `zaq1@WSX`. This fixture is for local development only.

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

## Backup and restore

Use SQLite’s backup facility or `VACUUM INTO` rather than copying only the `.db` file while it is being written in WAL mode.
For example, run `sqlite3 /data/aidle.db "VACUUM INTO '/backups/aidle-$(date +%F).db'"` in a maintenance context.
To restore, stop the API, replace the database with the verified backup, remove any matching `-wal` and `-shm` files, then start the API.

## Profiling

The service has no application cache, queues, or background workers.
Optional development tools include `heaptrack`, `valgrind --tool=massif`, `cargo flamegraph`, and `perf`.
Use them outside the container when investigating a real memory or CPU issue.
