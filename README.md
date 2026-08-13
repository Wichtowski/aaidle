# aAIdle

aAIdle is a daily guessing game for AI models.
It runs on a VPS with Node.js and SQLite.
The daily answer stays server-side.

## Local development

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
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
- `AAIDLE_GOOGLE_CLIENT_ID`
- `AAIDLE_GOOGLE_CLIENT_SECRET`
- `AAIDLE_RESEND_API_KEY`

Configure GitHub and Google OAuth callbacks as `https://aaidle.com/api/v1/auth/oauth/<provider>/callback`.
Verify `aaidle.com` in Resend and create `AAIDLE_RESEND_API_KEY` before enabling email/password accounts.

## Model catalog

Update [data/models.seed.json](data/models.seed.json), then run:

```bash
pnpm db:validate-seed
pnpm db:seed
```
