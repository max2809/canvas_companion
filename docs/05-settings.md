# Phase 5 — Settings page (0:45–1:00)

Build the Settings page where the user pastes their Canvas token.

## Page: `/app/settings/page.tsx`

Client component. Layout:

### Token form (top)

- Label: "Canvas access token"
- Input: shadcn `Input`, `type="password"` by default, with a small eye icon button on the right side of the input to toggle visibility
- If a token is already stored, pre-fill the input (but keep it masked until the user chooses to show it)
- Two buttons side by side below the input:
  - **Test connection** (primary)
  - **Disconnect** (destructive, ghost variant) — only visible if a token is currently stored

### Behaviour

**Test connection**:
1. Read the current input value
2. Call `fetchUser(token)` via `canvasFetch`
3. On success: save the token to storage, show a green badge below the buttons reading `✓ Connected as {user.name}`, also save the user to storage
4. On failure: show a red badge with the error message
5. Button shows a loading state during the request

**Disconnect**:
1. Show a confirm dialog: "This will clear your Canvas data from this browser. Continue?"
2. If confirmed: call `clearAll()` from storage and `window.location.reload()`

### Instructions section (below form)

A collapsible panel (use shadcn `Card`, toggle visibility with a small button that has a chevron icon):

- Heading: "How do I get a token?"
- Ordered list:
  1. Go to canvas.eur.nl
  2. Click **Account** → **Settings**
  3. Scroll to **Approved Integrations**
  4. Click **+ New Access Token**
  5. Name it "Companion App", leave the expiry blank, click **Generate Token**
  6. Copy the token and paste it above

### Privacy note (bottom)

Muted small text:
> Your token is stored only in your browser. It is never sent to any server except EUR's Canvas.

## Acceptance

- Paste a valid token → Test → see "Connected as [your name]"
- Reload → dashboard starts syncing (indicator in header shows "Syncing…" then "Synced just now")
- Click Disconnect → confirm → page reloads with no data, "Not connected" showing
- Paste an invalid token → Test → see red error

## When done

Commit: `git commit -m "phase 5: settings page"`. Summarize in 3 lines and wait.
