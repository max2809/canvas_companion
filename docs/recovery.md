# Recovery playbook

Reference this file only when something breaks. Load with `@docs/recovery.md` in Claude Code.

## CORS error in browser console

You're calling Canvas directly from the client. All Canvas requests must go through `/api/canvas/*`. Check that `canvasFetch` is never called with a `canvas.eur.nl` URL directly — it should only pass paths like `users/self` or `courses`.

## 401 Unauthorized from Canvas

The token is wrong, expired, or missing the `Authorization: Bearer` prefix in the proxy. Test in a terminal:
```
curl -H "Authorization: Bearer YOUR_TOKEN" https://canvas.eur.nl/api/v1/users/self
```
If this works, the bug is in the proxy route. If it fails too, regenerate the token in Canvas.

## 429 Rate limited

You're hammering the API in dev. Rely on the 15-minute TTL cache — don't call `refresh()` on every component mount. Check `useCanvasData` — it should only fetch on first mount and when `refresh()` is called explicitly.

## Empty courses array

Confirm the URL includes `enrollment_state=active`. Try also `state[]=available`. Some EUR courses might be in an unusual state between terms.

## Assignments missing `submission` field

The URL must include `?include[]=submission`. Without it, you can't tell what's submitted and the traffic light will be wrong.

## Pagination returns only the first page

The proxy isn't following `Link: <url>; rel="next"`. Test with a course that has 50+ assignments. Check that the proxy reads the `Link` header, parses the `rel="next"` URL, and concatenates the JSON arrays.

## Traffic lights all green when they shouldn't be

Usually caused by one of:
- Assignments missing `submission` → fix the include param
- Wrong treatment of `omit_from_final_grade` — you might be excluding graded items that should count
- Time zone issues comparing `due_at` — make sure comparisons use `Date` objects, not string comparisons

## Dashboard shows stale data after settings change

On disconnect, call `clearAll()` from storage and `window.location.reload()`. The hook won't see the change unless the page reloads.

## Styles look broken in production but fine in dev

Usually Tailwind's `content` config is missing some paths. Make sure `tailwind.config.ts` includes all paths where classes appear.

## Build fails with a type error you can't fix fast

As a last resort (only during the time crunch), add `// @ts-expect-error` with a comment explaining what to fix later. Do NOT add `any` types broadly.

## Running out of time

Cut in this order:
1. **Skip Phase 9 polish** — ship the less-polished version
2. **Skip Phase 8 expand-on-click** — make course cards read-only (still show traffic light + diagnostic)
3. **Skip Phase 10 deploy** — demo locally with `pnpm dev`

Never cut Phase 6 (dashboard) or Phase 7 (traffic light logic) — they are the demo.
