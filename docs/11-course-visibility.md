# Phase 11 — Course visibility toggle (15–20 min)

Add a "hide course" feature so users can exclude old/irrelevant courses from the Dashboard and Courses grid. Canvas returns stale courses in `enrollment_state=active` that clutter the app.

## Non-goals

- No deletion from Canvas (impossible anyway)
- No backend changes — hidden list lives in localStorage only
- No per-course settings panel — just a simple show/hide toggle

## Changes

### 1. Storage — add a hidden courses list

In `/lib/storage.ts`, add a new key:

```ts
export const StorageKeys = {
  // ...existing keys
  HIDDEN_COURSES: 'cc.hiddenCourses',  // number[]
} as const;
```

Add two helpers in `/lib/storage.ts`:

```ts
export function getHiddenCourseIds(): number[] {
  return get<number[]>(StorageKeys.HIDDEN_COURSES) ?? [];
}

export function toggleCourseHidden(courseId: number): number[] {
  const current = getHiddenCourseIds();
  const next = current.includes(courseId)
    ? current.filter(id => id !== courseId)
    : [...current, courseId];
  set(StorageKeys.HIDDEN_COURSES, next);
  return next;
}
```

### 2. Hook — apply filtering

In `/lib/hooks.ts`, modify `useCanvasData()`:

- Add new state: `hiddenCourseIds: number[]`
- On mount, read it from storage
- Expose a `toggleHidden(courseId: number)` function that updates both state and storage
- Return an additional field `allCourses: CanvasCourse[]` (unfiltered)
- The existing `courses` field now returns **only visible** courses (all courses minus hidden)
- Same for `assignments`: filter out any whose `course_id` is hidden

This way, every existing page automatically respects visibility without changes.

Updated return type:

```ts
{
  user: CanvasUser | null;
  courses: CanvasCourse[];           // visible only
  allCourses: CanvasCourse[];        // new — all including hidden
  hiddenCourseIds: number[];         // new
  assignments: EnrichedAssignment[]; // filtered to visible courses
  loading: boolean;
  error: string | null;
  lastSync: Date | null;
  refresh: () => Promise<void>;
  toggleHidden: (courseId: number) => void;  // new
}
```

### 3. Courses page — add the toggle

In `/app/courses/page.tsx`:

**On each course card**, add a small "hide" button in the top-right corner (next to or replacing the current traffic light position — use your judgment). Use an `EyeOff` icon from lucide-react. On click: call `toggleHidden(course.id)`. The button is a small ghost icon button, `aria-label="Hide course"`.

**Prevent card-expand on hide-button click**: add `e.stopPropagation()` in the button handler so clicking Hide doesn't expand the card.

**At the bottom of the courses grid**, below all visible course cards, add a divider and a small section:

```
— — —
Hidden courses (3)   [Show]
```

Clicking "Show" expands a muted-styled list of hidden courses. Each row has:
- Course code · course name (muted text)
- An "Unhide" button (`Eye` icon) that calls `toggleHidden(course.id)`

If there are zero hidden courses, omit this section entirely.

### 4. Dashboard — no changes needed

Since the hook now filters `assignments` to visible courses only, the dashboard automatically respects the setting. Verify this works.

### 5. Settings page — add a reset option

In `/app/settings/page.tsx`, add a small section near the bottom (above the privacy note):

```
Course visibility
You have N courses hidden.
[Show all courses]
```

The button calls `clear(StorageKeys.HIDDEN_COURSES)` and refreshes the page. Only show the section if `hiddenCourseIds.length > 0`.

## Edge cases

- User hides all courses → Dashboard shows an empty state. That's fine; it's user-caused. Consider a small hint: "You have N courses hidden. [Show them]"
- A previously-hidden course disappears from Canvas (e.g. unenrolled) → the dead ID stays in localStorage. No issue — filtering ignores it silently.
- Sync brings in a new course → it's visible by default. Correct behavior.

## Acceptance

- Click hide on a course → it disappears from the grid immediately and from the dashboard
- Scroll to bottom of Courses page → see "Hidden courses (N)" → click Show → see the list → click Unhide → course returns to the grid
- Refresh the page → hidden state persists
- Settings page shows an accurate count and the "Show all" button works

## When done

Commit: `git commit -m "phase 11: course visibility toggle"`. Summarize in 3 lines.
