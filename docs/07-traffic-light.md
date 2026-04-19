# Phase 7 — Traffic light logic (1:45–2:00)

Build the pure logic module that classifies course health. No UI yet — that's Phase 8.

## File: `/lib/traffic-light.ts`

```ts
export type CourseStatus = 'green' | 'yellow' | 'red';

export interface CourseHealth {
  status: CourseStatus;
  reason: string;            // one-line diagnostic for the UI
  nextActions: string[];     // 0–3 short imperative strings
  stats: {
    overdue: number;
    dueSoon: number;         // due within 3 days
    dueThisWeek: number;     // due within 7 days
    submitted: number;
    total: number;
  };
}

export function getCourseHealth(
  course: CanvasCourse,
  assignments: CanvasAssignment[]
): CourseHealth
```

## Counting rules

Filter assignments first: ignore any with `omit_from_final_grade === true` (voluntary items shouldn't affect the traffic light).

For the remaining assignments:

- **overdue**: `due_at` is in the past AND (`submission.missing === true` OR `submission.workflow_state === 'unsubmitted'` OR no submission object)
- **dueSoon**: `due_at` within 3 days from now AND not submitted
- **dueThisWeek**: `due_at` within 7 days from now AND not submitted
- **submitted**: `submission.workflow_state` is `'submitted'` or `'graded'`
- **total**: all non-voluntary assignments

## Status rules (first match wins)

- 🔴 **RED** if `overdue >= 2` OR (`overdue >= 1` AND `dueSoon >= 1`) OR `dueSoon >= 2`
- 🟡 **YELLOW** if `overdue === 1` OR `dueSoon === 1` OR `dueThisWeek >= 2`
- 🟢 **GREEN** otherwise

## Diagnostic text (the `reason` field)

Build this from the counts. Examples:

- Green, no upcoming: `"All caught up"`
- Green, upcoming in far future: `"On track — next deadline in 9 days"`
- Green, nothing scheduled: `"No assignments yet"`
- Yellow, one due soon: `"1 assignment due in the next 3 days"`
- Yellow, one overdue: `"1 assignment overdue"`
- Yellow, busy week: `"3 assignments due this week"`
- Red, multiple overdue: `"2 assignments overdue, 1 due this week"`
- Red, crunch: `"3 assignments overdue, 2 due in the next 3 days"`

## Next actions

Up to 3 short imperative strings referencing specific assignments by name. Prioritize:

1. Overdue items first (oldest overdue first)
2. Due-soon items (nearest first)
3. Due-this-week items (nearest first)

Format examples:
- `"Submit Module 4 Quiz (overdue)"`
- `"Start Group Assignment 2 (due Friday)"`
- `"Submit Ethics Essay (due tomorrow)"`

If the course is green with nothing upcoming, return an empty array.

## Edge cases to handle

- Course with zero assignments → green, `"No assignments yet"`, no actions
- All assignments submitted → green, `"All caught up"`, no actions
- Assignment with `due_at === null` → ignored in counting (no due date = no urgency signal)

## Acceptance

Write a small test file `/lib/traffic-light.test.ts` (doesn't need to run — just for your own sanity check) or walk through these cases in your head:
- Empty assignments array → green
- One assignment due tomorrow, not submitted → yellow
- One assignment overdue, none due soon → yellow
- Two overdue → red
- One overdue + one due in 2 days → red
- Everything submitted → green

## When done

Commit: `git commit -m "phase 7: traffic light logic"`. Summarize in 3 lines and wait.
