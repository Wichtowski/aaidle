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

Run all required checks with:

```bash
pnpm check
pnpm test:e2e
```

## Delivery

Pull requests to `main` run `pnpm check`.
Formatting-only lint failures are fixed and committed by `github-actions[bot]` to the PR branch.
Automation never commits to `main`.

After merge, the release workflow creates a SemVer tag, verifies the application and Docker image, publishes a GitHub Release, then waits for `production` approval before deploying.
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

## Model catalog

Update [data/models.seed.json](data/models.seed.json), then run:

```bash
pnpm db:validate-seed
pnpm db:seed
```
