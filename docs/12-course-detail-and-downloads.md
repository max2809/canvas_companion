# Phase 12 — Course detail page + file downloads (45–60 min)

Introduce a per-course detail page at `/courses/[id]` with a tabbed layout. One of those tabs — Files — lets the user download course materials individually or as a ZIP. This phase also restructures the Courses page to navigate to the detail page instead of expanding inline.

## What we're building (structure)

```
/courses/[id]
  ├── Overview     ← traffic light breakdown + next actions
  ├── Assignments  ← full list (was the expand-on-click before)
  ├── Files        ← download interface (the new feature)
  └── Announcements ← placeholder for now ("Coming soon")
```

The shell is designed to absorb future per-course features (announcements, grades, notes) without restructuring again.

## Non-goals

- No video/Panopto download (not possible via Canvas API)
- No folder preservation in ZIP (flat files, prefixed with folder name if needed)
- No persistent download history or offline reading — files go straight to the user's Downloads folder
- No background downloads — user must keep the tab open while downloading

## Prerequisites — add one dependency

Install JSZip:

```
pnpm add jszip
pnpm add -D @types/jszip
```

Tell me this is the only new dependency before installing. If for any reason it fails, fall back to single-file downloads only and note it.

## 1. Proxy: extend to binary file passthrough

The existing `/api/canvas/[...path]/route.ts` returns JSON. We need a separate route for binary file downloads (PDFs etc.) that streams the response without trying to parse it as JSON.

Create `/app/api/canvas-file/route.ts`:

- `GET` route
- Query params: `url` (the full Canvas file URL to fetch)
- Header: `x-canvas-token`
- Validates `url` starts with `https://canvas.eur.nl/` or `https://eur.instructure.com/` — reject anything else with 400 (prevents the proxy being used as an open relay)
- Fetches the URL with `Authorization: Bearer <token>`
- Returns the response body as a stream, passing through `Content-Type` and `Content-Length` headers
- Timeout 60 seconds (files are larger than JSON)
- `export const runtime = 'nodejs'`

Also extend `/lib/canvas.ts`:

```ts
export interface CanvasFile {
  id: number;
  folder_id: number;
  display_name: string;
  filename: string;
  url: string;               // pre-signed download URL
  size: number;              // bytes
  content_type: string;
  updated_at: string;
  locked: boolean;
  hidden: boolean;
}

export interface CanvasFolder {
  id: number;
  name: string;
  full_name: string;         // e.g. "course files/Week 1"
  parent_folder_id: number | null;
  files_count: number;
}

export async function fetchCourseFiles(token: string, courseId: number): Promise<CanvasFile[]> {
  return canvasFetch<CanvasFile[]>(
    `courses/${courseId}/files?per_page=100`,
    token
  );
}

export async function fetchCourseFolders(token: string, courseId: number): Promise<CanvasFolder[]> {
  return canvasFetch<CanvasFolder[]>(
    `courses/${courseId}/folders?per_page=100`,
    token
  );
}

export async function downloadCanvasFile(token: string, file: CanvasFile): Promise<Blob> {
  const res = await fetch(`/api/canvas-file?url=${encodeURIComponent(file.url)}`, {
    headers: { 'x-canvas-token': token },
  });
  if (!res.ok) throw new CanvasError(res.status, await res.text());
  return await res.blob();
}
```

Filter out `locked: true` and `hidden: true` files in the UI — we can't download them.

## 2. Restructure the Courses page

Update `/app/courses/page.tsx`:

- **Remove** the expand-on-click behavior entirely
- **The whole course card is now a `<Link>`** to `/courses/[id]`
- The hide button (from Phase 11) stays in the top-right corner and must `e.preventDefault()` + `e.stopPropagation()` to avoid navigating when clicked
- Add a small `ChevronRight` icon on the far right of each card to signal it's clickable
- Keep everything else: traffic light, diagnostic, stats row, hidden courses section at the bottom

The "expanded assignments" content doesn't disappear — it moves to the course detail page's Assignments tab.

## 3. Course detail page

Create `/app/courses/[id]/page.tsx` and `/app/courses/[id]/layout.tsx`.

### Layout (`layout.tsx`)

Client component. Structure:

**Header**:
- Back button (`ArrowLeft` icon) → navigates to `/courses`
- Course code as a badge (small, uppercase)
- Course full name as the page title
- Subtitle: traffic-light diagnostic (from `getCourseHealth`)

**Tab bar** (use shadcn `Tabs`):
- Overview
- Assignments
- Files
- Announcements

The tab bar uses URL state — active tab is reflected in the URL as `?tab=files` — so links are shareable and refreshes preserve state.

Read the course by id from `useCanvasData().allCourses` (use `allCourses`, not `courses`, so hidden courses are still viewable via direct URL). If the course isn't found, show a "Course not found" empty state with a link back to `/courses`.

### Overview tab

- Large traffic-light indicator
- Full diagnostic text
- "Next actions" as a vertical list of cards (same data as `getCourseHealth().nextActions`)
- Quick stats: `X overdue · Y due this week · Z submitted · N total`

Nothing new here — just reorganized from Phase 8's expand content.

### Assignments tab

The list that used to live in the expand-on-click:
- Sorted by due date (soonest first, no-due-date last)
- Status icon, name, humanized due date, "Open in Canvas" link
- Nothing else

### Files tab — the main work of this phase

See section 4 below.

### Announcements tab

Placeholder only:
- Empty state icon
- Text: "Announcements view coming soon"
- Nothing else

We'll build this properly in a later phase. Having the tab stub in place is enough.

## 4. Files tab — download interface

Create `/app/courses/[id]/files-tab.tsx` (client component, rendered inside the Files tab).

### Data loading

On mount:
1. Call `fetchCourseFiles(token, courseId)` and `fetchCourseFolders(token, courseId)` in parallel
2. Filter out `locked` and `hidden` files
3. Cache the result in localStorage under key `cc.files.{courseId}` with a 60-minute TTL (files change rarely)
4. Loading state: skeleton rows

### Layout

**Header row**:
- Left: count — "42 files · 210 MB total" (format bytes with `formatBytes(size)` helper)
- Right: two buttons:
  - **Download all** (primary, `Download` icon) — kicks off a ZIP build
  - **Refresh** (ghost, `RotateCw` icon) — re-fetches file list

**File list**:
- Scrollable list of file rows
- Each row:
  - Checkbox on the left (for future multi-select — for now, functional but not connected to a bulk action; can be hidden if time-tight)
  - File type icon (use `FileText` for PDF, `FileSpreadsheet` for xlsx, `FileImage` for images, `File` default — derive from `content_type`)
  - File name (bold if not yet downloaded in this session — can skip this nicety)
  - Muted meta: size + last updated ("2.3 MB · updated 3 days ago")
  - Right: individual download button (`Download` icon, ghost)

**Grouping by folder** (optional if time allows):
- Group files by `folder_id`, use `CanvasFolder.full_name` as the group label
- Collapsible groups with `ChevronDown` / `ChevronRight`
- "course files/" is the root — render it as "Course files"

If time is tight, skip the grouping and just render a flat list sorted alphabetically. Note it in a code comment as a v0.2 improvement.

### Individual file download

Clicking the file row's download button:
1. Calls `downloadCanvasFile(token, file)` to get a Blob
2. Uses a helper to trigger a browser download with the correct filename:

```ts
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

3. Shows a toast or inline indicator on the row during the download

### "Download all" — the ZIP flow

Clicking "Download all":

1. Show a modal (use shadcn `Dialog`) with:
   - Title: "Download all files for {course_code}"
   - Body: "This will download N files (X MB total) as a ZIP. Keep this tab open until it finishes."
   - Progress section (initially hidden): progress bar + current file name + "X of N"
   - Buttons: Cancel, Start
2. On Start:
   - Create a new `JSZip` instance
   - Iterate files with **concurrency 3** (use a simple queue — see below)
   - For each file: fetch via `downloadCanvasFile`, add to the ZIP under `zip.file(file.display_name, blob)`
   - Update progress after each file
   - If a file fails (404, timeout): log it and continue — don't abort the whole ZIP. Keep a list of failures to show at the end.
3. When all files are done:
   - `zip.generateAsync({ type: 'blob' })` to build the final ZIP
   - Call `triggerDownload(zipBlob, '{course_code}-files.zip')`
   - Show a success state in the modal with any failures listed
   - Close on user confirm

### Concurrency queue (simple)

```ts
async function downloadQueue<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  const queue = [...items];
  const workers = Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(workers);
}
```

Use this for both the parallel file fetches during ZIP build.

### Cancellation

The Cancel button during download should set a flag checked by the worker. On cancel: stop queuing new files, let in-flight ones finish, close the modal without downloading the ZIP.

### Filename collisions in the ZIP

If two files share a `display_name`, append ` (2)`, ` (3)`, etc. to the later ones. Simple counter keyed on filename.

## 5. Polish

- The Downloads tab button shows a subtle badge if a download is in progress across the app (nice-to-have, skip if time-tight)
- Keyboard shortcut: `Esc` cancels the download modal
- File sizes formatted with a `formatBytes(n)` helper (e.g. `1.4 MB`, `234 KB`, `12 B`)
- Relative dates formatted with an existing helper if one exists, else a minimal version

## Edge cases

- Course has zero files → empty state: "No files in this course yet"
- User cancels mid-download → no partial ZIP saved, modal closes cleanly
- Network error during ZIP build → show error state in modal, let user retry
- File >100 MB → works but is slow. Show size warning in the "Download all" modal if total > 500 MB: "This is a large download (1.2 GB). Make sure you have a stable connection."
- Canvas returns 401 during file download → token expired. Clear storage, redirect to Settings (reuse the existing 401 handler from the hook).

## Acceptance

- Click a course card on `/courses` → navigates to `/courses/[id]`
- Tabs work, URL reflects active tab
- Files tab loads and shows all downloadable files
- Single file download puts the correct file in the Downloads folder
- "Download all" opens the modal, shows progress, produces a ZIP named `{course_code}-files.zip`
- Cancel works cleanly
- All existing features (Dashboard, Courses grid, hide/unhide, Settings) still work
- Announcements tab shows the placeholder

## When done

Commit: `git commit -m "phase 12: course detail page + file downloads"`. Summarize in 3 lines.
