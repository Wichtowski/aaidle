# aAIdle architecture

```text
Browser
  | GET /api/v2/games/classic/...
  v
Rust/Axum API
  | deterministic, secret-derived daily selection
  v
SQLite
  | public DTO: id/date/mode/expiresAt/columns (never answer_model_id)
  v
Browser localStorage: aaidle:progress:v1

Browser POST /api/games/classic/challenges/:id/guesses + requestId
  v
Guess service
  |- loads hidden answer in server memory
  |- performs pure comparison
  |- stores idempotent guess_event
  |- UPSERTs challenge_guess_stats
  `- updates anonymous streak only when solved
  v
Public guessed model + comparison response
```

## Boundaries

- The Rust API accesses SQLite through SQLx. Browser code under `src/` never imports database code.
- The full catalog is seeded from `data/models.seed.json`; only an intentionally public autocomplete projection is sent to browsers.
- `daily_challenges.answer_model_id` is not selected into the public challenge DTO, model autocomplete response, RSC props, or local storage.
- The client owns UI progress in the versioned, Zod-validated external localStorage store. It is SSR-safe and synchronizes `storage` events between tabs.
- After email activation, the local progress cache is merged into an account-owned database record and subsequent local changes are synchronized automatically.
- `user_challenge_completions` records one server-confirmed completion per verified account and daily challenge for public completion totals.
- `guess_events.request_id` provides retry idempotency; `(challenge_id, player_id, guessed_model_id)` prevents duplicate models and aggregate double-counting.
- Anonymous `crypto.randomUUID()` player IDs have no IP, device, or location data associated with them.

Classic is the only mode definition today. Challenge selection, validation, and comparison live in domain modules so provider, emoji, logo, model-card, output, and timeline modes can be added without a second backend or a UI rewrite.
