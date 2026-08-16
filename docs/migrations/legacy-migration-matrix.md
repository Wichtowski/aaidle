# Legacy backend migration matrix

This audit covers every `app/api/v1/**/route.ts` file present on 2026-08-15.
The frontend currently calls every route marked `Yes` through `lib/api/client.ts` or direct `fetch` calls.
Email verification and OAuth callback routes are entered through email links or provider redirects rather than a normal client fetch.
Every target path in this table is relative to `/api/v1`.

| Legacy route | Purpose and current implementation | Frontend uses it | Target v1 route | Status | Action | Preserved behavior or migration note |
| --- | --- | --- | --- | --- | --- | --- |
| `GET/PUT /admin/settings/hardcore-soundtrack` | Superadmin setting in route and `site_settings` | Yes | `/admin/settings/hardcore-soundtrack` | FULLY MIGRATED | REPLACE | Server-side superadmin check, same-origin update, SoundCloud validation, and public allowlist |
| `GET/PATCH/DELETE /admin/users/:userId` | User administration in route and auth/progress services | Yes | `/admin/users/:userId` | FULLY MIGRATED | REPLACE | Permission, disabled-account, completion, progress, and safe saved-guess deletion behavior |
| `GET /admin/users` | Paginated user search in route | Yes | `/admin/users` | FULLY MIGRATED | REPLACE | Bounded page, deterministic ordering, and escaped case-insensitive search |
| `POST /agent/a2a` | JSON-RPC game agent in `lib/agent` | No | `/agent/a2a` | DEFERRED | DEFER | Not used by the current frontend |
| `POST /auth/account-deletion/complete` | Deletes account using email token | Yes | `/auth/account-deletion/complete` | FULLY MIGRATED | REPLACE | Same-origin, short-lived cookie token, clears cookies, and cascades account data |
| `POST /auth/account-deletion` | Requests account deletion email | Yes | `/auth/account-deletion` | FULLY MIGRATED | REPLACE | Session, persisted rate limit, and Resend delivery |
| `GET /auth/account-deletion/verify` | Validates deletion email token and sets cookie | External | `/auth/account-deletion/verify` | FULLY MIGRATED | REPLACE | Browser redirect and five-minute HTTP-only cookie |
| `POST /auth/email-verification` | Re-sends email verification | Yes | `/auth/email-verification` | FULLY MIGRATED | REPLACE | Account state, persisted rate limit, and Resend delivery |
| `GET /auth/email-verification/verify` | Consumes verification token | External | `/auth/email-verification/verify` | FULLY MIGRATED | REPLACE | One-time token consumption and browser redirect |
| `POST /auth/logout` | Deletes session and clears cookie | Yes | `/auth/logout` | FULLY MIGRATED | REPLACE | Same session cookie name, same-origin enforcement, and no-store response |
| `GET /auth/me` | Current session user | Yes | `/auth/me` | FULLY MIGRATED | REPLACE | Session refresh and disabled account state |
| `GET /auth/oauth/:provider/callback` | OAuth callback | External | `/auth/oauth/:provider/callback` | FULLY MIGRATED | REPLACE | GitHub and Google signed-state validation, identity linking, and session issuance |
| `GET /auth/oauth/:provider` | Starts OAuth login | Yes | `/auth/oauth/:provider` | FULLY MIGRATED | REPLACE | GitHub and Google authorization redirects |
| `POST /auth/password-reset/complete` | Resets password from cookie token | Yes | `/auth/password-reset/complete` | FULLY MIGRATED | REPLACE | One-time token consumption, session invalidation, and new session issuance |
| `POST /auth/password-reset` | Sends reset email | Yes | `/auth/password-reset` | FULLY MIGRATED | REPLACE | Privacy-preserving accepted response and Resend delivery |
| `GET /auth/password-reset/verify` | Validates reset token and sets cookie | External | `/auth/password-reset/verify` | FULLY MIGRATED | REPLACE | Browser redirect and fifteen-minute HTTP-only cookie |
| `POST /auth/password` | Password login | Yes | `/auth/password` | FULLY MIGRATED | REPLACE | Verifies the existing Node `scrypt` wire format and issues the same session-cookie name |
| `GET/PUT /auth/progress` | Cloud progress sync | Yes | `/auth/progress` | FULLY MIGRATED | REPLACE | Validated one-megabyte sync, request-ID merge, completion records, recomputed saved stats, and Hardcore persistence |
| `POST /auth/register` | Registration plus verification email | Yes | `/auth/register` | FULLY MIGRATED | REPLACE | Persisted rate limit, verification token, and Resend delivery |
| `GET /games/classic/:category/:difficulty` | Full Classic game payload | Yes | `/games/classic/:category/:difficulty` | FULLY MIGRATED | REPLACE | Six focused category routes plus the authenticated Hardcore configuration |
| `GET /games/classic/challenge` | Legacy LLM Challenge alias | Yes | No alias | INTENTIONALLY DROPPED | DROP | Frontend Part 2 uses explicit category and difficulty routes |
| `POST /games/classic/challenges/:challengeId/guesses` | Classic guess result | Yes | `/games/classic/challenges/:challengeId/guesses` | FULLY MIGRATED | REPLACE | Rich selected-column comparison, pool enforcement, idempotency, and trajectory token |
| `GET /games/classic/challenges/:challengeId/stats` | Public Classic aggregates | Yes | `/games/classic/challenges/:challengeId/stats` | FULLY MIGRATED | REPLACE | Returns only answer-safe aggregates |
| `POST /games/classic/challenges/:challengeId/trajectory` | Solved-game model-space trajectory | Yes | `/games/classic/challenges/:challengeId/trajectory` | FULLY MIGRATED | REPLACE | Persisted completion or signed challenge-bound token |
| `POST /games/classic/hardcore/access` | Grants Hardcore access after ritual | Yes | `/games/classic/hardcore/access` | FULLY MIGRATED | REPLACE | Server queries six distinct focused Challenge completions for the current UTC date |
| `GET /games/classic/hardcore` | Legacy Hardcore alias | Yes | No alias | INTENTIONALLY DROPPED | DROP | Frontend Part 2 uses the canonical Hardcore route |
| `GET /games/classic/normal` | Legacy Normal alias | Yes | No alias | INTENTIONALLY DROPPED | DROP | Frontend Part 2 uses the explicit LLM Normal route |
| `POST /games/emoji/challenges/:challengeId/guesses` | Emoji family guess | Yes | `/games/emoji/challenges/:challengeId/guesses` | FULLY MIGRATED | REPLACE | Family validation, deterministic answer, duplicate policy, and completion count |
| `GET /games/emoji/challenges/:challengeId/hints` | Progressive emoji hints | Yes | `/games/emoji/challenges/:challengeId/hints` | FULLY MIGRATED | REPLACE | Reveals only earned deterministic clues through six |
| `GET /games/emoji` | Emoji game payload | Yes | `/games/emoji` | FULLY MIGRATED | REPLACE | Initial two clues, public family pool, and completion count |
| `POST /issues` | GitHub issue reporting | Yes | `/issues` | DEFERRED | DEFER | Independent product tooling that does not block game or account migration |
| `GET /public-config` | Public soundtrack configuration | Yes | `/public-config` | FULLY MIGRATED | REPLACE | Public normalized Hardcore soundtrack URL only |

## Audit summary

The matrix contains 36 legacy route-method operations.
The v2 service fully migrates 31 operations, intentionally drops 3 aliases, and defers 2 independent operations.
The counts add up to 36 and exclude future product features.
Classic has six focused categories plus Hardcore, which is a separately access-controlled Classic configuration rather than a focused category.
Focused Classic supports Normal and Challenge difficulties.
Hardcore uses the legacy `classic:hardcore:hardcore` storage mode only.
Emoji is a deterministic model-family puzzle.

## Future features - outside migration scope

Logo
Timeline
Family Tree

## Data audit

The legacy database already contains normalized model, challenge, anonymous player, user, session, account-token, completion, site-setting, and progress tables.
The legacy seed also contains `minPool`, country, weight availability, and heterogeneous `categoryDetails` that the original SQLite schema did not retain.
Migration `0002_game_metadata_and_emoji.sql` adds a typed JSON boundary for this heterogeneous game metadata and dedicated Emoji guess records without overwriting legacy data.
Migration `0003_accounts.sql` creates the legacy-compatible account tables in the v2 schema without mutating the existing Node database.

## Intentional differences

The old Classic stats route exposes the five most guessed model names.
That can reveal the answer after another player solves, so v2 will retain only answer-safe aggregates until the caller has solved the challenge.
The old process-local pending-challenge maps and game payload caches are intentionally not retained because they have unbounded lifetime risks and are unnecessary with database uniqueness constraints.
