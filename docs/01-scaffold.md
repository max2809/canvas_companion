# Phase 1 — Scaffold (0:00–0:15)

Scaffold the Next.js project and build the empty shell.

## Steps

1. Initialize with `create-next-app`:
   - TypeScript: yes
   - Tailwind: yes
   - App Router: yes
   - `src/` directory: **no** (use `/app` at root)
   - Import alias: default (`@/*`)

2. Install and initialize shadcn/ui:
   - Default style
   - Base color: `neutral`
   - CSS variables: yes

3. Add these shadcn components only: `button`, `card`, `input`, `label`, `badge`, `skeleton`

4. Install `lucide-react` for icons.

## Build the app shell

**Root layout (`/app/layout.tsx`)**:
- Fixed left sidebar, 240px wide
- App name "Canvas Companion" at the top of the sidebar (bold, 18px)
- Three nav links with `lucide-react` icons:
  - Dashboard (`LayoutDashboard` icon) → `/`
  - Courses (`BookOpen` icon) → `/courses`
  - Settings (`Settings` icon) → `/settings`
- Active route highlighted subtly
- Main content area fills remaining width
- Dark mode applied by default via `class="dark"` on `<html>`. No theme toggle.

**Three placeholder pages** (`/app/page.tsx`, `/app/courses/page.tsx`, `/app/settings/page.tsx`):
- Each shows a header with its title ("Dashboard" / "Courses" / "Settings")
- Below the header, a `<p>` saying "Coming soon"
- Use a shared `<PageHeader>` component in `/components/page-header.tsx` that takes `title` and optional `subtitle` props

**Styling**:
- Consistent padding on main content: `px-8 py-6`
- Inter font via `next/font/google`

## Acceptance

- `pnpm dev` runs without errors
- All three routes render
- Sidebar navigation works
- Dark mode is visible

## When done

Commit: `git commit -m "phase 1: scaffold + shell"`. Then summarize in 3 lines and wait for me to clear and send phase 2.
