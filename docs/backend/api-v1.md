# AIdle API v1

All public routes are under `/api/v1`.
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

The API returns `400` for invalid input, `404` for missing resources, `409` for conflicting guesses, `413` for a request body over 16 KB, `429` for persisted application rate limits, and `500` without internal details for unexpected errors. A `429` response includes `Retry-After`; the reverse proxy or CDN may enforce additional coarse limits before a request reaches the API.

## `GET /api/v1/health`

Requires an `x-aaidle-health-key` header whose value exactly matches `HEALTH_KEY`.
Returns process health without a database query. The version is the deployed release tag.
Requests without a valid key receive an empty `401 Unauthorized` response.

```json
{
  "status": "ok",
  "service": "aidle-api",
  "apiVersion": "v1",
  "version": "v0.1.0"
}
```

## `GET /api/v1/health/ready`

Returns the same response after checking database connectivity.
It requires the same `x-aaidle-health-key` header. Use this for authenticated readiness checks.

## `GET /api/v1/models`

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

`GET /api/v1/games/classic/{category}/{difficulty}` returns the public Classic challenge, exactly eligible model pool, displayed comparison columns, and global completion count.
The six focused categories are `llm`, `cv`, `nlp`, `object-detection`, `classical-ml`, and `filters`.
Focused categories support `normal` and `challenge` difficulties.
Hardcore is the seventh legacy Classic category and an access-controlled configuration, exposed cleanly as `GET /api/v1/games/classic/hardcore`.
The legacy data records it as `classic:hardcore:hardcore`, which is an internal storage mode rather than a public route shape.

`POST /api/v1/games/classic/challenges/{challengeId}/guesses` accepts a typed Classic guess with `guessedModelId`.
Accepted attempts must be sequential relative to server-persisted history. The maximum number of stored guesses for one player and challenge is the exact eligible model-pool size, not a fixed client-provided value.
`GET /api/v1/games/classic/challenges/{challengeId}/stats` returns answer-safe aggregate statistics.
`POST /api/v1/games/classic/challenges/{challengeId}/trajectory` returns the exact eligible model space only after the caller has a persisted account completion or a HMAC-signed trajectory token issued with a correct Classic guess.
The signed token is bound to that challenge and answer model and does not disclose either value.
`POST /api/v1/games/classic/hardcore/access` grants permanent account access only when the signed-in account has completed all six distinct focused Classic Challenge boards on the current UTC date.
Generic `/challenges/*` routes are not part of the public v2 contract.

`GET /api/v1/games/emoji-clues/{difficulty}` returns an answer-safe Emoji Clues challenge, its initially available clues, public entity choices, and global completion count. Supported difficulties are `normal`, `challenge`, and access-controlled `hardcore`.
`GET /api/v1/games/emoji-clues/challenges/{challengeId}/hints?playerId={uuid}` returns the clues earned by that player.
`POST /api/v1/games/emoji-clues/challenges/{challengeId}/guesses` accepts retry-safe `playerId`, `requestId`, `attemptNumber`, and `guessedEntityId` fields. The server validates and records every accepted guess, so rejected or duplicate requests cannot change progress.
Attempts must be sequential, and their hard limit is the eligible entity-pool size for the challenge difficulty.
Emoji Clues supports curated `emoji`, `architecture`, `algorithm`, and `operator` entities. Selection and clue variants are deterministic for a day and difficulty without exposing the selected answer in public responses.

Classic and Emoji guess requests share persisted abuse limits: 360 requests per minute for a player and challenge, 1,500 per player per hour, 600 per client IP per minute, and 5,000 per client IP per hour. IPv6 addresses are grouped by `/64`, and all subjects are HMAC-hashed before storage. Exact request replays and duplicate answers cannot add another guess event, but every HTTP submission is still subject to request-rate limits.

## Session routes

All browser account mutations require an `Origin` exactly matching `APP_ORIGIN`.
Authenticated browser mutations additionally use double-submit CSRF protection: the frontend copies the readable `aaidle_csrf` cookie into the `X-AAIdle-CSRF-Token` header. The opaque `aaidle_session` and one-time-token cookies remain `HttpOnly` and `SameSite=Lax`; all authentication cookies are marked `Secure` in production.
Authentication request limits are persisted in SQLite and keyed by an HMAC of the validated client IP and normalized email address.

`POST /api/v1/auth/register` creates an unverified password account and sends a verification message through Resend.
It always returns `202` for an existing account to avoid account enumeration.
In non-production without `RESEND_API_KEY`, the response includes `activationUrl` for local development.

`POST /api/v1/auth/password` rotates any existing browser session and creates new `aaidle_session` and CSRF cookies after password verification. It does not return a bearer token.
`GET /api/v1/auth/me` returns the session account or `null`.
`POST /api/v1/auth/logout` deletes the session and clears both authentication cookies.

External API clients can exchange password credentials at `POST /api/v1/auth/token`. This endpoint returns a short-lived, 15-minute bearer JWT and does not create a browser session or refresh token. Browser code does not call this endpoint or store JWTs.

`POST /api/v1/auth/email-verification` requests another email-verification message.
`GET /api/v1/auth/email-verification/verify?token={token}` consumes the one-time token and redirects to the login page.

`POST /api/v1/auth/password-reset` accepts an email address and always responds with `202` after rate limiting.
`GET /api/v1/auth/password-reset/verify?token={token}` stores the short-lived reset token in an HTTP-only cookie and redirects to the password reset page.
`POST /api/v1/auth/password-reset/complete` consumes that token, invalidates old sessions, and starts a newly rotated session.

`POST /api/v1/auth/account-deletion` requires authentication within the previous 15 minutes and sends a five-minute confirmation message.
`GET /api/v1/auth/account-deletion/verify?token={token}` stores the short-lived confirmation token in an HTTP-only cookie and redirects to the deletion page.
`GET /api/v1/auth/account-deletion/status` verifies that the active recent session and deletion token belong to the same account. It returns only authorization state, token expiry, and a masked email address; direct visits to the deletion page redirect back to the profile when authorization is absent.
`POST /api/v1/auth/account-deletion/complete` requires the exact `DELETE {maskedEmail}` confirmation phrase, same-account recent session, one-time token, Origin, and CSRF token. It atomically deletes the account and clears account cookies.

`GET /api/v1/auth/oauth/github` and `GET /api/v1/auth/oauth/google` start OAuth using a signed state cookie.
`GET /api/v1/auth/oauth/{provider}/callback` validates that state, exchanges the authorization code, links or creates the persisted identity, and starts a newly rotated session.
Both provider credentials must be configured together for a provider to be available.

`GET /api/v1/auth/progress` returns the authenticated account's persisted progress or `null`.
`PUT /api/v1/auth/progress` validates and merges local progress from another device.
The account retains its original player ID, deduplicates guesses by request ID, keeps solved games solved, preserves the earliest completion timestamp, and recalculates Classic saved-game statistics. A progress entry creates an account completion only when the persisted player ID has a matching server-accepted correct guess; client preferences never grant Hardcore access.
The request body limit for this route is 16 KB.

## Admin and public configuration

`GET /api/v1/admin/users` is permission-protected, paginated at 50 rows, deterministically ordered, and supports escaped case-insensitive email and display-name search.
`GET /api/v1/admin/users/{userId}` returns the allowlisted account, completion, progress, and Hardcore-access information required by the existing admin interface.
`PATCH /api/v1/admin/users/{userId}` and `DELETE /api/v1/admin/users/{userId}` require a non-disabled superadmin and same-origin requests.
The `DELETE` route preserves legacy behavior by deleting one saved cloud-progress guess, not by deleting the account or anonymous aggregate game events.
`GET` and `PUT /api/v1/admin/settings/hardcore-soundtrack` are superadmin-only.
The update accepts only public HTTPS SoundCloud URLs and `GET /api/v1/public-config` exposes only the normalized soundtrack URL.

## Issue reporting

`POST /api/v1/issues` requires a signed-in, non-disabled account and a same-origin request. It accepts a `title` from 8 to 120 characters and a `description` from 20 to 5,000 characters, then creates an issue in the project tracker using the server-side `GITHUB_ISSUES_TOKEN`. The endpoint is limited to three reports per account and client IP per hour and returns the created issue URL. The GitHub token is never sent to the browser or logged.

## Migration mapping

The current Node route handlers remain outside this backend for frontend migration compatibility.
The Rust service itself only exposes these v1 routes.

| Existing route family | Rust v1 route |
| --- | --- |
| `/api/v1/games/classic/*` | `/api/v1/games/classic/{category}/{difficulty}` and scoped Classic challenge routes |
| `/api/v1/games/classic/challenges/{challengeId}/stats` | `/api/v1/games/classic/challenges/{challengeId}/stats` |
| legacy model catalog in game payloads | `/api/v1/models` |
