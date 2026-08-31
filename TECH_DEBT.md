# Frontend Technical Debt

This document records frontend cleanup and performance debt identified during the code review.

## Priority 1 — High-value refactors

### Split oversized game components

- [x] Classic loading, caching, and retry lifecycle extracted.
- [x] Timeline loading, hydration, persistence, and speedrun lifecycle extracted.
- [x] Emoji loading, history, submission, retry, and completion lifecycle extracted.

Files:

- `src/app/components/game/classic/ClassicGame.tsx`
- `src/app/components/game/timeline/TimelineGame.tsx`
- `src/app/components/game/emoji/EmojiGame.tsx`

These components combine data fetching, caching, local-progress hydration, submission handling, retries, animations, dialogs, navigation, and rendering.

Suggested direction:

- Extract game-loading hooks.
- Extract guess/submission hooks.
- Extract completion and retry state.
- Keep page components focused on composition and layout.

### Split the API client by domain

File: `src/lib/api/client.ts` — 639 lines

Authentication, progress, admin, Classic, Emoji, Timeline, and public configuration APIs are all implemented in one class. DTO conversion is also mixed into request methods.

Suggested direction:

- Create `auth-api.ts`, `classic-api.ts`, `emoji-api.ts`, `timeline-api.ts`, `admin-api.ts`, and `progress-api.ts`.
- Keep shared HTTP/error/CSRF behavior in a small request module.
- Move DTO normalization and response validation to domain boundaries.

### Consolidate duplicated model-space behavior

Files:

- `src/app/components/game/ModelSpaceTrajectory.tsx`
- `src/app/components/admin/AdminProgressRecord.tsx`
- `src/lib/domain/models/model-space.ts`

The game and admin views both implement related projection and pointer-drag behavior.

Suggested direction:

- Extract shared projection calculations.
- Extract a reusable rotation/pointer-drag hook.
- Share the SVG rendering primitives where practical.

## Priority 2 — Performance and correctness

### Avoid repeated reference-model calculations during dragging

File: `src/app/components/game/ModelSpaceTrajectory.tsx`

Reference model coordinates are recalculated on every pointer-driven render. Precompute model-space coordinates when the category or reference model list changes, then only recalculate the lightweight projection during rotation.

### Memoize profile-derived data

File: `src/app/profile/page.tsx`

Sorting, filtering, streak calculation, distribution generation, and local timeline reads happen during every render.

Suggested direction:

- Use `useMemo` for local history and statistics.
- Move streak/distribution calculation into pure utilities with unit tests.
- Avoid rereading local timeline storage unless the progress snapshot changes.

### Debounce Timeline localStorage writes

File: `src/app/components/game/TimelineGame.tsx`

The complete Timeline state is serialized and saved whenever positions or feedback change. During dragging, this can produce unnecessary synchronous storage work.

Suggested direction:

- Debounce writes by approximately 200–300 ms.
- Flush immediately on submit, navigation, or unmount.

### Stabilize SoundCloud widget lifecycle

File: `src/app/components/game/HardcoreSoundtrack.tsx`

The widget setup effect can run again when progress state changes. The `READY` callback also captures the initial volume value.

Suggested direction:

- Store the widget instance in a ref.
- Store the latest volume in a ref.
- Add explicit listener cleanup if supported by the widget API.
- Keep autoplay preference separate from player visibility.

### Cache public configuration for the session

Files:

- `src/lib/api/client.ts`
- `src/app/components/game/HardcoreSoundtrack.tsx`

`publicConfig()` uses `cache: "no-store"` and is requested whenever the soundtrack mounts. The public soundtrack URL can be cached in memory for the session or for a short time.

## Priority 3 — Maintainability cleanup

### Remove misleading `use client` directives

Several files contain `"use client"`, although this project is a Vite SPA and does not use React Server Components. These directives are harmless but suggest leftover Next.js migration code.

Suggested direction:

- Remove them after confirming they are not consumed by tooling.

### Replace legacy privacy URL versioning

File: `src/App.tsx`

The UI still exposes `/privacy/v1` and redirects `/privacy` there. If versioning is no longer required, make `/privacy` canonical and retain the old path only as a compatibility redirect.

### Consolidate local-progress migrations

File: `src/lib/storage/local-progress-store.ts`

The store currently handles versioned keys, legacy Classic mode migration, Inner Circle compatibility storage, cloud reconciliation, and local-stat rebuilding in one module.

Suggested direction:

- Move each migration into a named migration function.
- Add an explicit storage schema version migration pipeline.
- Keep persistence, migration, and derived-stat logic separate.

### Reduce page/component responsibility overlap

The page files, game components, and shared UI components contain overlapping loading, error, toast, and completion patterns.

Suggested direction:

- Standardize loading/error states.
- Create shared request-state utilities.
- Use consistent abort and retry handling across all games.

## Asset debt

Several public images are larger than necessary, including `polish-text.png`, `jacket.png`, and `hardcore-fire.webp`. The public asset directory is approximately 12 MB.

Suggested direction:

- Convert large PNGs to optimized WebP or AVIF.
- Resize images to their actual rendered dimensions.
- Keep lazy loading for below-the-fold clue images.

## Verification status

The current frontend passes:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

This document is an inventory and does not imply that all listed items should be addressed immediately. The recommended order is: split shared game/API logic, optimize repeated render work, then perform compatibility and naming cleanup.
