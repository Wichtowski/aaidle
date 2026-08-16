# aAIdle

aAIdle is a daily guessing game for AI models.
It runs on a VPS with Node.js and SQLite.
The daily answer stays server-side.

## Documentation

- [Architecture](docs/architecture.md) describes system boundaries and data flow.
- [Backend operations](docs/backend/operations.md) covers the Rust service, configuration, SQLite, and Docker.
- [API v1 contract](docs/backend/api-v1.md) defines the public Rust API.
- [Legacy migration matrix](docs/migrations/legacy-migration-matrix.md) records the Node-to-Rust migration scope and deferred features.

## Local development

```bash
pnpm install
cp backend/.env.example backend/.env
make up
pnpm dev
```

When `RESEND_API_KEY` is not configured locally, account activation links are shown in the browser instead of being sent by email.

Run all required checks with:

```bash
pnpm check
pnpm test:e2e
```

## Delivery

Pull requests to `main` run `pnpm check`.
Formatting-only lint failures are fixed and committed by `github-actions[bot]` to the PR branch.
Automation never commits to `main`.

After merge, the release workflow creates a SemVer tag, verifies the application and Docker image, and publishes the tagged image to GitHub Container Registry.
After `production` approval, the VPS pulls that image and keeps only the runtime Compose file, environment file, and persistent SQLite volume.
Make the linked GitHub Container Registry package public so the VPS can pull it without a registry credential.
The release tag is exposed as `html[version]` in the deployed page.
Production browser tests run in two shards and publish an Allure report to GitHub Pages.

Configure the `production` GitHub Environment with a required reviewer.
Set GitHub Pages to deploy from GitHub Actions.

Repository secrets:

- `AAIDLE_VPS_HOST`
- `AAIDLE_VPS_USER`
- `AAIDLE_VPS_SSH_KEY`
- `AAIDLE_DEPLOY_PATH`
- `AAIDLE_DAILY_SELECTION_SECRET`

## Accounts

Accounts support GitHub and Google OAuth, plus email/password sign-in with email activation and password reset.
The production environment also needs these secrets before account sign-in is enabled:

- `AAIDLE_AUTH_SECRET`
- `AAIDLE_GITHUB_CLIENT_ID`
- `AAIDLE_GITHUB_CLIENT_SECRET`
- `AAIDLE_GITHUB_ISSUES_TOKEN` with Issues write access for `Wichtowski/aaidle`
- `AAIDLE_GOOGLE_CLIENT_ID`
- `AAIDLE_GOOGLE_CLIENT_SECRET`
- `AAIDLE_RESEND_API_KEY`

## Admin access

User permissions are stored in SQLite as `user`, `developer`, or `superadmin`.
`developer` and `superadmin` accounts can inspect registered users, synced progress, and challenge completions at `/admin`.
Passwords, sessions, and authentication tokens are never exposed in the dashboard.

Configure GitHub and Google OAuth callbacks as `https://aaidle.com/api/v1/auth/oauth/<provider>/callback`.

## Static frontend

The frontend is a Vite-built React SPA. CI deploys the `dist/` assets to the VPS, where the
platform Caddy instance serves the SPA fallback and proxies `/api/*` to the private Rust API
container. The frontend does not run in a production container.
Issue reporting is intentionally disabled until the deferred Rust `/api/v1` issue-reporting endpoint exists.
Verify `aaidle.com` in Resend and create `AAIDLE_RESEND_API_KEY` before enabling email/password accounts.

## Model catalog

The canonical model and Emoji-game seed data live in [data](data). After updating either file, run:

```bash
pnpm db:validate-seed
```
