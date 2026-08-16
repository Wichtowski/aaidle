# AIdle API v2

All public routes are under `/api/v2`.
There are no unversioned API routes and no `/api/v1` compatibility routes in this service.
All JSON fields use camelCase.

## Error responses

Errors use this structure:

```json
{
  "error": {
    "code": "DUPLICATE_GUESS",
    "message": "This model has already been guessed."
  }
}
```

The API returns `400` for invalid input, `404` for missing resources, `409` for conflicting guesses, `413` for a request body over 16 KB, `429` is intentionally delegated to the reverse proxy, and `500` without internal details for unexpected errors.

## `GET /api/v2/health`

Returns process health without a database query.

```json
{
  "status": "ok",
  "service": "aidle-api",
  "apiVersion": "v2",
  "version": "0.1.0"
}
```

## `GET /api/v2/health/ready`

Returns the same response after checking database connectivity.
Use this for readiness checks.

## `GET /api/v2/models`

Returns public model discovery records.
The response is cacheable for five minutes locally and one hour in a shared proxy.

Query parameters:

| Parameter | Default | Limits | Meaning |
| --- | --- | --- | --- |
| `cursor` | none | 128 characters | Continue after a model ID |
| `limit` | `50` | 1-100 | Maximum records returned |

```json
{
  "models": [
    {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "providerName": "OpenAI",
      "familyName": "GPT",
      "aliases": ["GPT 4o"]
    }
  ],
  "nextCursor": "gpt-4o"
}
```

## Game routes

`GET /api/v2/games/classic/{category}/{difficulty}` returns the public Classic challenge, exactly eligible model pool, displayed comparison columns, and global completion count.
The six focused categories are `llm`, `cv`, `nlp`, `object-detection`, `classical-ml`, and `filters`.
Focused categories support `normal` and `challenge` difficulties.
Hardcore is the seventh legacy Classic category and an access-controlled configuration, exposed cleanly as `GET /api/v2/games/classic/hardcore`.
The legacy data records it as `classic:hardcore:hardcore`, which is an internal storage mode rather than a public route shape.

`POST /api/v2/games/classic/challenges/{challengeId}/guesses` accepts a typed Classic guess with `guessedModelId`.
`GET /api/v2/games/classic/challenges/{challengeId}/stats` returns answer-safe aggregate statistics.
`POST /api/v2/games/classic/challenges/{challengeId}/trajectory` returns the exact eligible model space only after the caller has a persisted account completion or a HMAC-signed trajectory token issued with a correct Classic guess.
The signed token is bound to that challenge and answer model and does not disclose either value.
`POST /api/v2/games/classic/hardcore/access` grants permanent account access only when the signed-in account has completed all six distinct focused Classic Challenge boards on the current UTC date.
Generic `/challenges/*` routes are not part of the public v2 contract.

`GET /api/v2/games/emoji` returns the public Emoji challenge, first two clues, family answer pool, and global completion count.
`GET /api/v2/games/emoji/challenges/{challengeId}/hints?playerId={uuid}` returns only the clues earned by that player.
Players begin with two clues and gain one after each accepted unique wrong family guess, capped at six.
After a correct guess, all six deterministic clues are returned.
Idempotent retries and rejected duplicates never unlock clues.
`POST /api/v2/games/emoji/challenges/{challengeId}/guesses` accepts the same retry-safe `playerId`, `requestId`, and `attemptNumber` fields as Classic, with `guessedFamilyId` in place of `guessedModelId`.

## Session routes

All account mutations require an `Origin` exactly matching `APP_ORIGIN`.
Session and one-time-token cookies are `HttpOnly`, `SameSite=Lax`, and marked `Secure` in production.
Authentication request limits are persisted in SQLite and keyed by an HMAC of the validated client IP and normalized email address.

`POST /api/v2/auth/register` creates an unverified password account and sends a verification message through Resend.
It always returns `202` for an existing account to avoid account enumeration.
In non-production without `RESEND_API_KEY`, the response includes `activationUrl` for local development.

`POST /api/v2/auth/password` creates an `aaidle_session` cookie after password verification.
`GET /api/v2/auth/me` returns the session account or `null`.
`POST /api/v2/auth/logout` deletes the session and clears its cookie.

`POST /api/v2/auth/email-verification` requests another email-verification message.
`GET /api/v2/auth/email-verification/verify?token={token}` consumes the one-time token and redirects to the login page.

`POST /api/v2/auth/password-reset` accepts an email address and always responds with `202` after rate limiting.
`GET /api/v2/auth/password-reset/verify?token={token}` stores the short-lived reset token in an HTTP-only cookie and redirects to the password reset page.
`POST /api/v2/auth/password-reset/complete` consumes that token, invalidates old sessions, and starts a new session.

`POST /api/v2/auth/account-deletion` requires a session and sends a five-minute confirmation message.
`GET /api/v2/auth/account-deletion/verify?token={token}` stores the short-lived confirmation token in an HTTP-only cookie and redirects to the deletion page.
`POST /api/v2/auth/account-deletion/complete` consumes that token, permanently deletes the account, and clears account cookies.

`GET /api/v2/auth/oauth/github` and `GET /api/v2/auth/oauth/google` start OAuth using a signed state cookie.
`GET /api/v2/auth/oauth/{provider}/callback` validates that state, exchanges the authorization code, links or creates the persisted identity, and starts a session.
Both provider credentials must be configured together for a provider to be available.

`GET /api/v2/auth/progress` returns the authenticated account's persisted progress or `null`.
`PUT /api/v2/auth/progress` validates and merges local progress from another device.
The account retains its original player ID, deduplicates guesses by request ID, keeps solved games solved, preserves the earliest completion timestamp, recalculates Classic saved-game statistics, records valid challenge completions, and persists Hardcore unlocks.
The request body limit for this route is 1 MB.

## Admin and public configuration

`GET /api/v2/admin/users` is permission-protected, paginated at 50 rows, deterministically ordered, and supports escaped case-insensitive email and display-name search.
`GET /api/v2/admin/users/{userId}` returns the allowlisted account, completion, progress, and Hardcore-access information required by the existing admin interface.
`PATCH /api/v2/admin/users/{userId}` and `DELETE /api/v2/admin/users/{userId}` require a non-disabled superadmin and same-origin requests.
The `DELETE` route preserves legacy behavior by deleting one saved cloud-progress guess, not by deleting the account or anonymous aggregate game events.
`GET` and `PUT /api/v2/admin/settings/hardcore-soundtrack` are superadmin-only.
The update accepts only public HTTPS SoundCloud URLs and `GET /api/v2/public-config` exposes only the normalized soundtrack URL.

## Migration mapping

The current Node route handlers remain outside this backend for frontend migration compatibility.
The Rust service itself only exposes these v2 routes.

| Existing route family | Rust v2 route |
| --- | --- |
| `/api/v1/games/classic/*` | `/api/v2/games/classic/{category}/{difficulty}` and scoped Classic challenge routes |
| `/api/v1/games/classic/challenges/{challengeId}/stats` | `/api/v2/games/classic/challenges/{challengeId}/stats` |
| legacy model catalog in game payloads | `/api/v2/models` |
