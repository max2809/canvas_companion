# Reference — Canvas types

Use these TypeScript interfaces in `/lib/canvas.ts`. They match EUR Canvas's API responses. Only include fields we actually use.

```ts
export interface CanvasUser {
  id: number;
  name: string;
  short_name: string;
  email?: string;
}

export interface CanvasCourse {
  id: number;
  name: string;              // "BT1213 Business information management"
  course_code: string;       // often same as name at EUR
  term?: { name: string };   // "2025-2026"
  enrollment_state?: string;
}

export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  description?: string | null;
  due_at: string | null;           // ISO timestamp or null
  points_possible: number | null;
  html_url: string;                // link back to Canvas
  submission_types: string[];
  has_submitted_submissions: boolean;
  omit_from_final_grade: boolean;
  submission?: CanvasSubmission;
}

export interface CanvasSubmission {
  id: number;
  assignment_id: number;
  submitted_at: string | null;
  score: number | null;
  grade: string | null;
  workflow_state: 'submitted' | 'unsubmitted' | 'graded' | 'pending_review';
  late: boolean;
  missing: boolean;
}

// Flat assignment enriched with course context for UI
export interface EnrichedAssignment extends CanvasAssignment {
  course_name: string;
  course_code_short: string;   // "BT1213" parsed out
}
```

## Helper to add

In the same file, export:

```ts
export function parseCourseCode(name: string): string {
  const match = name.match(/^([A-Z]{2,4}\d{4})/);
  return match ? match[1] : name.slice(0, 6);
}
```

## Notes

- Course names at EUR always follow `<CODE> <Title>`. The regex extracts the leading code. Fallback returns the first 6 chars so we always have something to render.
- Assignment weights are not reliably present in the API response; we ignore weights entirely in v0.
- Some assignments have `omit_from_final_grade: true` (voluntary items, practice tests). We still show them on the dashboard if they have a due date but consider ignoring them in the traffic-light logic.
