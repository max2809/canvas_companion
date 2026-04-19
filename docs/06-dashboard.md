# Phase 6 — Deadline dashboard (1:00–1:45)

Build the main dashboard. This is the home screen and should feel like the most polished page of the app.

## Page: `/app/page.tsx`

Client component. Uses `useCanvasData()`.

### Page header

- Title: "Dashboard"
- Subtitle: today's date (e.g. "Saturday, April 18") + a count like "3 assignments due this week"
- Refresh button on the right side of the header

### States

**No token** → empty state card centered in the page:
- Icon
- Heading: "Connect your Canvas account to get started"
- Button linking to `/settings`

**Loading** → 3 skeleton cards

**Error** → banner with the error message and a retry button; still render cached data below if available

**Loaded** → the 5 grouped sections below

### The 5 groups (render only if they contain items)

1. **Overdue** — red accent on the section heading. Assignments past `due_at` with `missing === true` OR (`submission.workflow_state === 'unsubmitted'` AND `due_at` in the past)
2. **Today** — assignments due today, not submitted
3. **This week** — assignments due in the next 7 days, not submitted (excluding today)
4. **Upcoming** — assignments due in 8–30 days
5. **Recently submitted** — muted styling. Assignments where `submitted_at` is within the last 7 days.

Filter out assignments where `omit_from_final_grade === true` AND `due_at` is more than 2 days away (these are usually voluntary/practice items). Keep near-term voluntary items visible.

Sort within each group by due date ascending (soonest first).

### Item card layout

Each assignment card is a horizontal row:

```
● BT1213 · Assignment name (bold)           Due in 2 days · 10 pts    [Open in Canvas ↗]
  Business information management                                     (small ghost button)
```

- Left dot: deterministic color per course (hash the `course_id` to pick from a 6-color palette — use HSL with fixed S/L, vary H)
- Course code is monospace and uppercase, small muted text
- Assignment name in normal weight, slightly larger
- Course full name below assignment name, small muted text
- Right side: due date humanized — "Due in 2 days", "Due today at 23:59", "Due 4 days ago", "Submitted"
- Points: "10 pts" only if `points_possible > 0`
- "Open in Canvas" is a ghost button with an external-link icon, opens `html_url` in a new tab

Use shadcn `Card` for each row. Spacing between cards: `gap-2`. Between groups: `gap-8`.

### Humanize due dates

Write a helper `humanizeDue(dueAt: string | null, submitted: boolean): string`:
- Submitted → "Submitted"
- null → "No due date"
- Past, not submitted → "Due X days ago" (or "yesterday" or "today")
- Today → "Due today at HH:MM"
- Tomorrow → "Due tomorrow at HH:MM"
- Within 7 days → "Due in X days"
- Beyond → "Due Mon 28 Apr"

## Acceptance

- With real Canvas data, all relevant assignments appear in the correct groups
- Empty groups are hidden
- Clicking "Open in Canvas" opens the right URL in a new tab
- No token → friendly empty state
- Refresh button re-fetches

## When done

Commit: `git commit -m "phase 6: dashboard"`. Summarize in 3 lines and wait.
