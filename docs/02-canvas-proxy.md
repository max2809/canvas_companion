# Phase 2 — Canvas API proxy (0:15–0:30)

Build the Canvas proxy route that the client will call to reach EUR Canvas.

## The proxy route

Create `/app/api/canvas/[...path]/route.ts`:

- Accept `GET` requests at `/api/canvas/<any-canvas-path>?<query>`
- Read the user's Canvas token from the request header `x-canvas-token`
- If missing or empty: return 401 JSON `{ error: "missing token" }`
- Forward the request to `https://canvas.eur.nl/api/v1/<path>?<query>` with:
  - `Authorization: Bearer <token>`
  - `Accept: application/json`
- **Handle pagination automatically**: if the Canvas response includes a `Link` header with `rel="next"`, follow it and concatenate array results. Stop at 10 pages max as a safety net.
- Return the concatenated JSON with status 200
- On upstream errors, pass through the Canvas status code and include `{ error, canvasStatus, canvasBody }`
- Cap each upstream request at 15 seconds using `AbortController`
- Set `export const runtime = 'nodejs'` — not edge. Pagination logic is more reliable on Node runtime.

## Minimal canvas client

Create `/lib/canvas.ts` with a client-side fetcher:

```ts
export async function canvasFetch<T>(path: string, token: string): Promise<T> {
  // calls /api/canvas/<path> with x-canvas-token header
  // returns parsed JSON
  // throws a typed CanvasError on non-2xx
}

export class CanvasError extends Error {
  constructor(public status: number, public body: unknown) { super(`Canvas ${status}`); }
}

export async function fetchUser(token: string): Promise<CanvasUser> {
  return canvasFetch<CanvasUser>('users/self', token);
}

export async function fetchCourses(token: string): Promise<CanvasCourse[]> {
  return canvasFetch<CanvasCourse[]>('courses?enrollment_state=active&include[]=term&per_page=100', token);
}

export async function fetchAssignments(token: string, courseId: number): Promise<CanvasAssignment[]> {
  return canvasFetch<CanvasAssignment[]>(`courses/${courseId}/assignments?include[]=submission&per_page=100`, token);
}
```

I'll provide the Canvas type definitions separately — reference `@docs/03-types.md` before building the fetch functions, or ask me to paste the types if they're not in context yet.

## Acceptance

- `curl -H "x-canvas-token: <real token>" http://localhost:3000/api/canvas/users/self` returns the user JSON
- A request with a missing header returns 401
- A request with a bad token passes through Canvas's 401 with the error body

## When done

Commit: `git commit -m "phase 2: canvas proxy"`. Then summarize in 3 lines and wait for clear + next.
