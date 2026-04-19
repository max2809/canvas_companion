# Phase 13 — EUR Timetable integration (45–60 min)

Integrate EUR's MyTimetable by parsing a user-supplied iCalendar URL. Show the timetable on both the Dashboard (this week's classes) and each Course detail page (all classes for that course). This gives the app a unified view of lectures + Canvas deadlines.

## Background (important context for Claude Code)

- EUR students can generate a personal iCalendar feed at `timetables.eur.nl` → Connect Calendar → iCalendar option
- The URL is personal and effectively auth-by-obscurity — treat it like a secret
- Events in the feed have titles like `BT1209 Finance Lecture 4` — the EUR course code prefix lets us map events to Canvas courses
- No API key, no OAuth — just an HTTPS GET on the personal URL returning a standard `.ics` file

## Non-goals

- No OAuth or MyTimetable REST API (not available to students)
- No filtering by event type for now — show everything (lectures, workshops, tutorials, exams)
- No iCal creation — read only
- No conflict detection with Canvas deadlines
- No past events display beyond a 2-week lookback

## Dependencies

Install:

```
pnpm add ical.js
```

Confirm this is the only new dep before installing. `ical.js` is Mozilla's iCalendar parser — well-maintained, ~60KB, handles all the RRULE edge cases we'd otherwise have to hand-roll.

## 1. Proxy route for iCal

Create `/app/api/timetable/route.ts`:

- `GET` route
- Query param: `url` (the user's personal iCal URL)
- No token header — the URL itself is the auth
- Validates `url` starts with `https://timetables.eur.nl/` — reject anything else with 400 (prevents open relay use)
- Fetches the URL with a 20-second timeout via `AbortController`
- Passes through the response body as text with `Content-Type: text/calendar`
- On upstream errors, returns `{ error, upstreamStatus }` with the same status
- `export const runtime = 'nodejs'`

## 2. Storage

In `/lib/storage.ts`, add a new key:

```ts
export const StorageKeys = {
  // existing keys...
  TIMETABLE_URL: 'cc.timetableUrl',
  TIMETABLE_EVENTS: 'cc.timetableEvents',   // parsed events array, with TTL
} as const;
```

Cache parsed events for 60 minutes (timetables don't change that often, and the iCal feed can be heavy).

## 3. Types and parser

Create `/lib/timetable.ts`:

```ts
export interface TimetableEvent {
  id: string;                    // UID from iCal
  title: string;                 // raw SUMMARY field
  courseCodeShort: string | null; // parsed code like "BT1209", or null if not matched
  eventTypeGuess: string | null;  // "Lecture" | "Workshop" | "Exam" | ... heuristic from title
  location: string | null;       // LOCATION field
  description: string | null;    // DESCRIPTION field
  start: string;                 // ISO timestamp
  end: string;                   // ISO timestamp
  isAllDay: boolean;
}

export async function fetchTimetable(url: string): Promise<TimetableEvent[]>;
export function eventsForCourse(events: TimetableEvent[], courseCodeShort: string): TimetableEvent[];
export function eventsInRange(events: TimetableEvent[], from: Date, to: Date): TimetableEvent[];
```

### Parsing logic

`fetchTimetable(url)`:
1. Calls `/api/timetable?url=<encoded>` and awaits text
2. Parses with `ICAL.parse(text)` then `new ICAL.Component(parsed)`
3. Gets `vevent` components, expands recurring events over a fixed window: **30 days in the past, 180 days in the future**
4. For each expanded event, produces a `TimetableEvent`:
   - `id`: prefer UID + start (since recurring events share UIDs); fallback to a hash of start + title
   - `courseCodeShort`: use the same `parseCourseCode()` helper from `/lib/canvas.ts`. If it doesn't match the regex, return `null`.
   - `eventTypeGuess`: lowercase the title and check for keywords in this order: "exam", "tentamen", "toets" → "Exam"; "workshop" → "Workshop"; "tutorial" → "Tutorial"; "seminar" → "Seminar"; "lecture", "lec" → "Lecture"; else null
   - `isAllDay`: true if the DTSTART has no time component

### Course matching

`eventsForCourse(events, codeShort)` returns events where `event.courseCodeShort === codeShort`. That's it — course matching is by code, nothing clever.

## 4. Hook extension

Extend `useCanvasData()` in `/lib/hooks.ts` to also manage timetable state:

Add to the returned object:

```ts
{
  // existing fields...
  timetableUrl: string | null;
  timetableEvents: TimetableEvent[];
  timetableLoading: boolean;
  timetableError: string | null;
  setTimetableUrl: (url: string | null) => void;
  refreshTimetable: () => Promise<void>;
}
```

Behavior:
- On mount, if a URL is stored, try cache (60-min TTL). If fresh → use cache. If stale → fetch in background.
- `setTimetableUrl(url)` stores the URL and triggers a fresh fetch
- `setTimetableUrl(null)` clears both URL and cached events
- `refreshTimetable()` forces re-fetch
- Failures: keep cached events visible, set `timetableError`. Never block the UI.

Keep timetable state independent of Canvas state — a broken iCal URL shouldn't break Canvas sync, and vice versa.

## 5. Settings page — add iCal URL section

In `/app/settings/page.tsx`, add a second card below the Canvas token card:

**Card title**: "EUR Timetable"

**Content**:
- Single input for the iCal URL (full URL, shown as `type="url"`)
- "Test & save" button: calls `fetchTimetable(url)`. On success → green badge "Loaded N events". On failure → red badge with error.
- "Remove" button (only if currently set): clears the URL and cached events
- Small note: "Only `timetables.eur.nl` URLs are accepted."

**Collapsible instructions** below the form:

> **How do I get my timetable URL?**
> 1. Go to timetables.eur.nl and log in
> 2. Click **Connect Calendar** (top right)
> 3. Select **iCalendar** from the dropdown
> 4. Copy the URL that appears (starts with `https://timetables.eur.nl/…`)
> 5. Paste it above

**Privacy note**: "The URL is stored only in your browser and is fetched through this app's server to work around browser restrictions. It is never logged or stored on any server."

## 6. Dashboard — "This week" section

On `/app/page.tsx`, add a new top-level section **above** all existing deadline groups:

### Section: "This week's classes"

- Only render if a timetable URL is configured and there's at least one event this week
- Horizontal layout: days of the week (Mon–Sun), with today's column highlighted
- Under each day, a compact list of events:
  - Time range (e.g. `13:00–15:00`)
  - Event title (truncated to single line with `...`)
  - Small course code badge if matched
  - Color dot using the same per-course color scheme from Phase 6

Mobile: stack days vertically instead of horizontally.

Behavior:
- Week boundaries: Monday 00:00 to Sunday 23:59
- Sort events within a day by start time
- Events with no matching Canvas course still render (show the full title, no badge)
- Click an event → opens a small popover/modal with full details (title, time, location, description)
- Below the calendar grid, a single link: "View full timetable" → opens `timetables.eur.nl` in a new tab (we don't rebuild the whole timetable view)

Loading state: skeleton row.
Error state: inline error with retry button, doesn't break the rest of the dashboard.

## 7. Course detail page — add a "Schedule" tab

The course detail page from Phase 12 has these tabs:
- Overview · Assignments · Files · Announcements

Add a fifth tab between Files and Announcements: **Schedule**.

Tab content (`/app/courses/[id]/schedule-tab.tsx`):

- Header: count line — "24 upcoming classes · Next: Tuesday at 13:00"
- List grouped by month. Under each month, a list of events sorted chronologically.
- Each event row shows:
  - Date (e.g. "Tue, 22 Apr")
  - Time range
  - Event type badge (Lecture / Workshop / Exam / etc., if guessed)
  - Title with the course-code prefix stripped (since we're already on the course page)
  - Location with a pin icon if present
- Past events: show the last 2 weeks in a collapsed "Past classes (N)" section at the bottom, expand on click
- Use `eventsForCourse(events, course.courseCodeShort)` to filter

Empty states:
- No timetable URL configured → friendly CTA: "Connect your EUR timetable in Settings to see classes here" + button to `/settings`
- Timetable configured but no matching events → "No classes found for {course_code} in your timetable. Check that the course is added to your MyTimetable."

## 8. Tab order fix

Since the tab order changes to Overview · Assignments · Files · Schedule · Announcements, update the tab layout in `/app/courses/[id]/layout.tsx`.

## 9. Refresh indicator

Extend the header sync indicator from Phase 4 to reflect both syncs:
- If Canvas and Timetable are both synced recently: "Synced Nm ago" (take the older of the two)
- If only one is synced: "Canvas synced Nm ago" or "Timetable synced Nm ago"
- If neither: "Not connected"
- Refresh button calls both `refresh()` and `refreshTimetable()` in parallel

## Edge cases to handle

- Recurring events that end before today (ended semesters) → expanded range excludes them via the 30-day lookback
- Events with no SUMMARY → render as "Untitled event"
- Events with `TRANSP:TRANSPARENT` (tentative/optional) → still show, don't special-case
- Non-UTC timezones in the iCal → `ical.js` handles this correctly if we respect the VTIMEZONE. Verify classes show in local time (Europe/Amsterdam).
- User pastes an invalid URL → clear error message, don't store
- User pastes a URL that works but returns an empty calendar → save the URL, show "No events found in the next 6 months"
- iCal feed >1MB → no special handling needed at our scale, but proxy should stream if ical.js allows it (it doesn't natively — just accept the memory cost)

## Acceptance

- Paste an iCal URL in Settings → Test & save → see "Loaded N events"
- Dashboard shows a "This week's classes" section with correct days/times
- Click an event → see full details in a popover
- Course detail page has a Schedule tab showing all upcoming events for that course, grouped by month
- Events for courses that don't match any Canvas course still appear on the Dashboard but not on any course page
- Removing the iCal URL in Settings clears both views gracefully
- Canvas sync continues to work even if the iCal fetch fails
- Dashboard shows "View full timetable" link that opens timetables.eur.nl

## When done

Commit: `git commit -m "phase 13: EUR timetable integration"`. Summarize in 3 lines.

## Out of scope — save for later

- Filtering events by type (lectures vs exams)
- Customizable week start day
- Conflict detection between timetable events and Canvas deadlines
- Push notifications for "class starting in 15 min"
- Rebuilding the full MyTimetable UI (the "View full timetable" link is sufficient)
- Timetable-to-Canvas-course auto-linking UI (auto-match by code is enough for v0)
