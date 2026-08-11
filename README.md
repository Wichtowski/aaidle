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

Point both `aaidle.com` and `www.aaidle.com` at the VPS, then add the Aidle Caddy route from the shared edge configuration.

The challenge rolls over at `00:00 UTC`. The first same-origin request to `/api/challenges/today?mode=classic` lazily, idempotently creates that day’s record using a SHA-256 derived selection. Production requires `DAILY_SELECTION_SECRET`.

## Content and modes

Add verified model records to [data/models.seed.json](data/models.seed.json) and run `pnpm db:validate-seed` before seeding. The domain exposes a `ChallengeMode` union for future modes; only `classic` is currently registered and implemented.
