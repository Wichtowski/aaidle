# aAIdle architecture

## System at a glance

aAIdle is a Vite-built React single-page application backed by a Rust/Axum API. The browser owns presentation and anonymous UI progress; the API owns challenge selection, answer secrecy, accepted guesses, accounts, and durable completion state. SQLite is the only application database.

```text
Browser (Vite + React)
  ├─ public GETs ────────────────┐
  ├─ guess/auth mutations ───────┤
  └─ local progress (v1)         │
                                  v
                         Rust/Axum API (/api/v1)
                                  │
                                  v
                          SQLx + SQLite
                                  │
                catalog / daily challenges / accounts
                guesses / progress / stats / settings
```

Production serves the static `dist/` assets through the platform Caddy instance. Caddy serves the SPA fallback and proxies `/api/*` to the private Rust container. The API never serves frontend assets.
Logo source images live in `public/logo-visual/` and shared `public/common/` and are published by the frontend alongside other static images. Seed JSON remains embedded only in the backend. Logo and Emoji may reference the same public source image. Logo answers are independent catalog IDs rather than Classic model IDs. The API derives each player’s authorized reveal revision from persisted guesses, downloads the catalog's `assetUrl` from `APP_ORIGIN`, and renders the configured crop or Gaussian blur. Zoom profiles use a focal point; Gaussian profiles use start and step strengths on the full frame. Downloaded originals expire after 24 hours; changing the active challenge or restarting the API clears originals and rendered variants. Public source images are directly accessible; the Logo UI uses only the API's player-authorized transformed image URLs.

## Repository map

| Area                     | Location                                                              | Responsibility                                                              |
| ------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Browser entry and routes | `src/App.tsx`, `src/app/`                                             | Pages, layouts, auth flows, and game UI                                     |
| Browser domain logic     | `src/lib/domain/`                                                     | Client-safe selection, comparison, model-space, and progress behavior       |
| Browser API boundary     | `src/lib/api/`, `src/lib/validation/`                                 | HTTP calls and response/request validation                                  |
| Local progress           | `src/lib/storage/`                                                    | Versioned, SSR-safe, Zod-validated local state                              |
| Rust routes              | `backend/src/api/v1/`                                                 | Versioned HTTP handlers for games, auth, progress, admin, and issues        |
| Rust domain logic        | `backend/src/domain/`                                                 | Selection, comparison, trajectory, timeline, visual clues, and streak rules |
| Persistence              | `backend/src/db.rs`, `backend/src/repository/`, `backend/migrations/` | SQLite pool, migrations, queries, and repositories                          |
| Seed data                | `data/`, `backend/src/bin/seed.rs`                                    | Canonical model and game catalogs                                           |
| Tests                    | `tests/`, `backend/tests/`                                            | Browser, API, unit, accessibility, and performance coverage                 |

## Runtime boundaries

- Browser code under `src/` must not access SQLite, Rust modules, server secrets, or private answer fields.
- All public API routes are versioned under `/api/v1`; JSON fields use camelCase.
- The Rust service runs SQLx migrations before accepting requests and uses a bounded SQLite pool with foreign keys, WAL mode, normal synchronous writes, and a busy timeout.
- The frontend is built independently. Backend changes must not assume that the API serves `dist/`.
- Game modes should keep route handling, domain rules, DTOs, and persistence separated so a new mode does not require a second backend.

## State ownership

| State                              | Owner                  | Notes                                                                          |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| Challenge answer and eligible pool | API/database           | Never sent in a public challenge DTO                                           |
| Accepted guesses and attempt order | API/database           | Server validates sequence and limits                                           |
| Anonymous player identity          | Browser                | UUID only; no IP, device, or location is attached                              |
| Anonymous UI progress              | Browser localStorage   | Key `aaidle:progress:v1`; validated and synchronized across tabs               |
| Authenticated UI cache             | Browser sessionStorage | Bounded game summaries for reload continuity; accepted game data stays on API  |
| Reconciled account marker          | Browser localStorage   | User ID only; prevents repeat linking writes in other tabs                     |
| Verified account progress          | API/database           | Local progress is merged only when backed by accepted server events            |
| Sessions and one-time auth tokens  | API cookies/API        | Browser sessions use HttpOnly cookies plus readable CSRF cookie/header pairing |
| Aggregate completion statistics    | API/database           | Derived from server-confirmed completions                                      |
| Admin permissions                  | API/database           | Roles are `user`, `developer`, and `superadmin`                                |

## Game flow and invariants

1. A public game request selects the day and difficulty deterministically from server-side data and secrets.
2. The API returns only the challenge ID, public choices/columns/clues, and safe metadata.
3. The browser submits a guess with a player ID and retry request ID where required.
4. The API loads the hidden answer, performs domain comparison, persists an idempotent event, updates aggregates, and returns a safe comparison result.
5. Account progress can be synchronized after authentication, but client preferences alone never create a completion or unlock Hardcore.

The following invariants are security and correctness boundaries:

- Never select or serialize `daily_challenges.answer_model_id` into public DTOs, RSC props, browser state, logs, or error messages.
- Guess attempts are sequential and bounded by the exact eligible pool size; clients cannot choose the limit.
- `request_id` makes retries idempotent. Duplicate guessed models cannot double-count events or statistics.
- Trajectory access requires a persisted account completion or a server-issued HMAC token bound to the completed challenge.
- Authenticated browser mutations require the exact configured `Origin` and CSRF protection.
- Secrets, bearer tokens, passwords, and session values must never be logged or exposed to admin UI responses.

## API surface

The public contract is documented in [API v1](backend/api-v1.md). Major route groups are:

- `/api/v1/games/classic/*` — Classic categories, guesses, stats, trajectory, and Hardcore access.
- `/api/v1/games/emoji/*` — Emoji challenges, hints, and guesses.
- `/api/v1/games/logo/*` — Logo challenge, progressive reveal state, and guesses.
- `/api/v1/games/timeline/*` — Timeline challenges and progress.
- `/api/v1/models` — Paginated public model discovery.
- `/api/v1/auth/*` — Password, OAuth, verification, reset, sessions, and progress sync.
- `/api/v1/admin/*` — Permission-protected user and site administration.
- `/api/v1/issues` — Authenticated issue reporting through the server-side GitHub token.
- `/api/v1/health*` — Secret-key-protected liveness and readiness checks.

## Change guidance for agents

Before editing, identify whether the change belongs to browser UI, browser domain logic, API handlers, Rust domain logic, persistence, or seed data. Read the nearest contract document before changing a boundary.

When changing an API response or route, update `docs/backend/api-v1.md` and the relevant frontend validation/tests. When changing schema or persistence, add an additive SQLx migration and update seed/repository tests. When changing gameplay, preserve answer secrecy, deterministic selection, retry idempotency, and server-authoritative completion rules.

Prefer focused changes. Do not rewrite unrelated dirty worktree changes, generated `dist/` output, or `backend/target/`. Keep public route compatibility explicit; do not reintroduce unversioned or generic legacy routes without a documented reason.

## Operational references

- [Root README](../README.md) — setup, checks, deployment, accounts, and catalog workflows.
- [Backend operations](backend/operations.md) — Rust setup, configuration, SQLite, Docker, backups, and profiling.
- [API v1 contract](backend/api-v1.md) — route and security behavior.
