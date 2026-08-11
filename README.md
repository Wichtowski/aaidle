# AIdle

AIdle is a daily, LoLdle-style guessing game for AI models. The hidden daily answer remains exclusively in Cloudflare D1; the browser receives a public challenge DTO and server-computed comparison results only.

## Stack

Vinext App Router, React, strict TypeScript, Tailwind CSS, Cloudflare Workers/D1, Drizzle schema and SQLite migrations, Zod, Vitest, React Testing Library, Playwright, and pnpm. There is no Python backend.

## Local setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:validate-seed
pnpm db:migrate:local
pnpm db:seed
pnpm dev
```

Use `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test:e2e` for verification. Local D1 is created by Wrangler under `.wrangler/`; remove only that directory when you intentionally want a completely fresh local database, then rerun migrations and seed.

## D1 and deployment

1. Create a D1 database: `pnpm wrangler d1 create aidle-db`.
2. Put its ID into `wrangler.jsonc` in place of `<D1_DATABASE_ID>`.
3. Apply migrations: `pnpm db:migrate:remote`.
4. Seed: `pnpm db:seed -- --remote`.
5. Set the selection secret interactively: `pnpm wrangler secret put DAILY_SELECTION_SECRET`.
6. Deploy: `pnpm deploy`.

The challenge rolls over at `00:00 UTC`. The first same-origin request to `/api/challenges/today?mode=classic` lazily, idempotently creates that day’s record using a SHA-256 derived selection. Production requires `DAILY_SELECTION_SECRET`; `.dev.vars` provides only the explicit local fallback.

## Content and modes

Add verified model records to [data/models.seed.json](data/models.seed.json) and run `pnpm db:validate-seed` before seeding. The domain exposes a `ChallengeMode` union for future modes; only `classic` is currently registered and implemented.
