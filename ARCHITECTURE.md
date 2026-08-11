# AIdle architecture

```text
Browser
  | GET /api/challenges/today
  v
Vinext route handler on Cloudflare Workers
  | ensureDailyChallenge() -- deterministic secret-derived selection
  v
Cloudflare D1
  | public DTO: id/date/mode/expiresAt/columns (never answer_model_id)
  v
Browser localStorage: aidle:progress:v1

Browser POST /api/challenges/:id/guess + requestId
  v
Guess service
  |- loads hidden answer in D1
  |- performs pure comparison
  |- stores idempotent guess_event
  |- UPSERTs challenge_guess_stats
  `- updates anonymous streak only when solved
  v
Public guessed model + comparison response
```

## Boundaries

- Route handlers access `env.DB` through server-only `lib/db/client.ts`. Client components never import Cloudflare bindings.
- `daily_challenges.answer_model_id` is not selected into the public challenge DTO, model autocomplete response, RSC props, or local storage.
- The client owns UI progress in the versioned, Zod-validated external localStorage store. It is SSR-safe and synchronizes `storage` events between tabs.
- `guess_events.request_id` provides retry idempotency; `(challenge_id, player_id, guessed_model_id)` prevents duplicate models and aggregate double-counting.
- Anonymous `crypto.randomUUID()` player IDs have no IP, device, or location data associated with them.

Classic is the only mode definition today. Challenge selection, validation, and comparison live in domain modules so provider, emoji, logo, model-card, output, and timeline modes can be added without a second backend or a UI rewrite.
