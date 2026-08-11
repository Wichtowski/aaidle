# AIdle

AIdle is a daily, LoLdle-style guessing game for AI models. The hidden daily answer remains exclusively in SQLite; the browser receives a public challenge DTO and server-computed comparison results only.

## Stack

Vinext App Router, React, strict TypeScript, Tailwind CSS, Node.js, SQLite, Zod, Vitest, React Testing Library, Playwright, and pnpm. There is no Python backend.

## Local setup

```bash
pnpm install
cp .env.example .env
pnpm db:validate-seed
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Use `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test:e2e` for verification. SQLite is created at `data/aidle.db` by the migration command. Set `DATABASE_PATH` to use another location.

## VPS deployment

The VPS deployment uses Docker Compose, a persistent SQLite volume, and the shared `echotrade_app_net` network so Caddy can proxy `aidle-app:3000`.

Configure these repository secrets before running the deploy workflow:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `AIDLE_DEPLOY_PATH`
- `AIDLE_DAILY_SELECTION_SECRET`
- `AIDLE_E2E_BYPASS_TOKEN` when Cloudflare Super Bot Fight Mode is enabled

Every push to `main` creates the next SemVer release tag, runs the unit and Docker-image checks in parallel, publishes the checked deployment archive to GitHub Releases, waits for approval through the `production` GitHub Environment, deploys that tagged archive to the VPS, and runs Playwright against `https://aaidle.com`.
Configure the `production` GitHub Environment with a required reviewer to make the approval step effective.
The first release uses the existing `package.json` version, currently `v0.1.0`.
Future `main` pushes make patch releases by default.
Use **Run workflow** to choose a `minor` or `major` SemVer bump.
The VPS retains only the currently deployed source at `/srv/aaidle/app`.
Versioned deployment archives and release notes live in GitHub Releases.
Production E2E tests run Chrome and mobile Chrome across two GitHub runners.
Raw Playwright blob reports retain retry traces, failure screenshots, and failure videos.
The final Allure report is deployed to GitHub Pages.
Set **Settings > Pages > Build and deployment > Source** to **GitHub Actions** before the first release.

## Pull request checks

Every pull request to `main` runs `pnpm check`.
When the only failure is formatting-related lint, the workflow formats and commits the fix as `github-actions[bot]` to the PR source branch, then reruns the check.
It never writes to `main` and cannot write to forked pull requests.

## Cloudflare bot protection

Do not enable Free-plan Bot Fight Mode for this domain if you need unattended production E2E tests.
It cannot be exempted by a WAF rule.
Use Super Bot Fight Mode instead, then create a zone-level WAF custom rule before enabling it.
Match `any(http.request.headers["x-aidle-e2e-token"][*] eq "<AIDLE_E2E_BYPASS_TOKEN>")`, select the **Skip** action, and skip only **Super Bot Fight Mode**.
Store the same random value as the `AIDLE_E2E_BYPASS_TOKEN` GitHub secret.
The secret header is sent only by the production E2E job.

Point both `aaidle.com` and `www.aaidle.com` at the VPS, then add the Aidle Caddy route from the shared edge configuration.

The challenge rolls over at `00:00 UTC`. The first same-origin request to `/api/challenges/today?mode=classic` lazily, idempotently creates that day’s record using a SHA-256 derived selection. Production requires `DAILY_SELECTION_SECRET`.

## Content and modes

Add verified model records to [data/models.seed.json](data/models.seed.json) and run `pnpm db:validate-seed` before seeding. The domain exposes a `ChallengeMode` union for future modes; only `classic` is currently registered and implemented.
