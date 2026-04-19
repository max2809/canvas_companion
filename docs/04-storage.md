# Phase 4 — Storage + data hook (0:30–0:45)

Build the localStorage layer and the React hook that everything else will read from.

## Storage wrapper

Create `/lib/storage.ts`:

```ts
export const StorageKeys = {
  TOKEN: 'cc.token',
  USER: 'cc.user',
  COURSES: 'cc.courses',
  ASSIGNMENTS: 'cc.assignments',     // Record<courseId, CanvasAssignment[]>
  LAST_SYNC: 'cc.lastSync',
} as const;
```

Functions:
- `get<T>(key): T | null` — parses JSON, returns null if missing
- `set<T>(key, value): void` — serializes to JSON
- `getWithTTL<T>(key, ttlMs): T | null` — returns null if the stored timestamp is older than `ttlMs`. Store values under TTL keys as `{ value, storedAt }`.
- `clear(key): void`
- `clearAll(): void` — removes all keys with the `cc.` prefix

All functions must be SSR-safe — guard every body with `if (typeof window === 'undefined') return null` (or the appropriate no-op).

## The hook

Create `/lib/hooks.ts`:

```ts
export function useCanvasData(): {
  user: CanvasUser | null;
  courses: CanvasCourse[];
  assignments: EnrichedAssignment[];   // flattened across all courses
  loading: boolean;
  error: string | null;
  lastSync: Date | null;
  refresh: () => Promise<void>;
}
```

Behaviour:
- On mount, read the token from storage. If no token: `loading=false`, `error="no-token"`, everything else empty.
- Try cache first: `courses` and `assignments` with 15-minute TTL. If fresh, use cache immediately, set `loading=false`, and return.
- If stale or missing:
  1. `loading=true`
  2. Fetch `users/self`
  3. Fetch courses
  4. Fetch assignments for each course in parallel with `Promise.all`
  5. Flatten assignments, enrich with `course_name` and `course_code_short`
  6. Write all fresh data to storage with timestamps
  7. `loading=false`
- `refresh()` bypasses cache and re-fetches
- On 401 from Canvas: `clearAll()`, set `error="invalid-token"`, redirect to `/settings` via `window.location.href`
- On other errors: keep cached data visible, set `error` to the message

## Sync indicator in the layout

Add a small header bar in the root layout showing sync status:

- If no token: "Not connected" in muted grey, with a link to `/settings`
- If syncing: "Syncing…" with a spinning icon
- If synced: "Synced Nm ago" with a small refresh icon button. Update the "Nm ago" live on a 30-second interval. Clicking the button calls `refresh()`.

Place this indicator top-right of the main content area (not in the sidebar).

## Acceptance

- With a valid token saved in storage, loading the dashboard triggers a fetch, populates storage, and the sync indicator shows "Synced just now"
- Reloading the page within 15 minutes uses the cache (no network request to Canvas)
- `refresh()` forces a re-fetch
- With no token, the indicator shows "Not connected" and the hook returns empty

## When done

Commit: `git commit -m "phase 4: storage + hook"`. Summarize in 3 lines and wait.
