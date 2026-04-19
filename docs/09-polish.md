# Phase 9 — Polish pass (2:30–2:50)

**Do NOT add new features.** Only improve what exists. Keep changes small and visible.

## The polish checklist

1. **Loading skeletons** — replace any loading spinners with shadcn `Skeleton` components that match the layout of the real content. Dashboard: 3 skeleton cards. Courses: 3 skeleton course cards.

2. **Empty states** — check every page handles:
   - No token (friendly CTA pointing to Settings)
   - No data (friendly message — "No active courses found" etc.)
   - Error (clear message + retry button)

3. **Error resilience** — if `refresh()` fails, show a small dismissible error banner at the top of the page but keep showing cached data. Never replace real data with an error screen.

4. **Sync indicator** — make sure the "Synced Nm ago" text updates live on a 30-second interval. Use a `setInterval` in a `useEffect`.

5. **Typography pass** — check line heights and font weights. Nothing cramped, nothing floating. Target:
   - Card titles: `font-semibold text-base`
   - Body/meta text: `text-sm text-muted-foreground`
   - Large numbers/counts: `font-mono`

6. **Color pass** — confirm traffic-light colors are the softer values (`#f87171`, `#fbbf24`, `#4ade80`), not Tailwind's default vivid ones. Check in both light and dark mode contexts.

7. **Accessibility quick-wins**:
   - Every icon-only button has an `aria-label`
   - Tab order is logical (top to bottom, left to right)
   - Focus rings visible on all interactive elements
   - Color is never the only way to convey status (traffic light icons supplement the colors)

8. **Favicon and title**:
   - Tab title: "Canvas Companion"
   - Simple circular SVG favicon — a filled circle in the app's accent color is fine

9. **Final walk-through** — run the app end-to-end as a first-time user:
   - Fresh browser / incognito
   - Land on dashboard → see empty state → click Settings
   - Paste token → test → confirmed
   - Back to dashboard → see skeletons → see real data
   - Go to Courses → see traffic lights → expand one → see assignments → click through to Canvas
   - Come back → refresh sync indicator
   - Fix any friction you notice

## Do not

- Refactor logic from earlier phases
- Add new features
- Install new libraries
- Change file structure

## When done

Commit: `git commit -m "phase 9: polish"`. Summarize what changed in 3 lines and wait for the deploy phase.
