# Phase 8 — Courses page (2:00–2:30)

Build the courses page: a grid of course cards with traffic lights. This is the second demo-worthy screen.

## Page: `/app/courses/page.tsx`

Client component. Uses `useCanvasData()` and `getCourseHealth()` from `/lib/traffic-light.ts`.

### Layout

Responsive grid of course cards:
- 1 column on mobile
- 2 columns on tablet (md)
- 3 columns on desktop (lg)
- `gap-4`

### Card content

Each course card:

**Top row**:
- Course code badge on the left (small, uppercase, monospace) — e.g. `BT1213`
- On the right: a 12px colored circle indicating status (red/yellow/green). Red circles get a subtle pulse via `animate-pulse` on the circle only, not the whole card.

**Middle**:
- Course full name (bold, 16px)
- Diagnostic `reason` text below (muted, 14px)

**Bottom — stats row** (small muted text):
- `X overdue · Y due this week · Z submitted`
- Omit any zero counts for cleanliness: `2 overdue · 3 submitted` is fine if nothing is due this week

**Expand behaviour**:
- Cards are clickable
- Click expands the card inline (not a navigation) to show the list of assignments for that course
- Clicking again collapses
- Expanded state uses an accordion pattern — smooth height transition

**Expanded content**:
- List of the course's assignments sorted by due date (soonest first, no due date last)
- Each row: status icon · assignment name · due date humanized · link to Canvas
- Status icons (lucide-react):
  - `CheckCircle2` green → submitted
  - `AlertCircle` amber → due in < 3 days, not submitted
  - `XCircle` red → overdue
  - `Circle` grey → future, not started

### Sort courses

Red first, then yellow, then green. Within each status group, sort alphabetically by course code.

### Edge cases

- No token → friendly empty state with link to `/settings`
- No courses → `"No active courses found in your Canvas account."` (could happen between terms)
- Course with zero assignments → green card, expand shows `"No assignments for this course yet."`

### Colors

Use these hex values (not Tailwind defaults — desaturated, softer):
- Red: `#f87171`
- Yellow: `#fbbf24`
- Green: `#4ade80`

Define them as CSS variables or Tailwind theme extensions so the values live in one place.

## Acceptance

- Grid renders with real data
- Clicking a card expands/collapses smoothly
- Red cards pulse subtly
- Sorting works (red-first)
- Links to Canvas open in a new tab
- Mobile layout works (single column)

## When done

Commit: `git commit -m "phase 8: courses page"`. Summarize in 3 lines and wait.
