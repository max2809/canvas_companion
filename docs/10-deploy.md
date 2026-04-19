# Phase 10 — Deploy (2:50–3:00)

Prepare for a clean Vercel deployment.

## Checklist

1. **README.md** at the root:
   - One-paragraph description of what the app does
   - Setup instructions:
     ```
     pnpm install
     pnpm dev
     ```
   - Note: requires a personal access token from canvas.eur.nl
   - Short feature list (Dashboard, Courses traffic light, Settings)
   - One-line footer: "Proof of concept. Built in 3 hours."

2. **`.gitignore`** includes:
   - `.next`
   - `node_modules`
   - `.env*`
   - `.vercel`

3. **No environment variables required** — confirm the code does not reference `process.env.*` anywhere. Everything runs from a cold Vercel deploy with zero config.

4. **Proxy route runtime** — double-check `/app/api/canvas/[...path]/route.ts` has `export const runtime = 'nodejs'` (not edge).

5. **Type check + build** — run:
   ```
   pnpm build
   ```
   Fix any type errors or build warnings. Do not deploy a broken build.

6. **Git**:
   ```
   git add .
   git commit -m "phase 10: ready for deploy"
   ```

7. **Tell me the Vercel deploy command and what to expect**:
   - Install Vercel CLI if needed: `npm i -g vercel`
   - Run: `npx vercel`
   - Prompts I should answer (project name, scope, link to existing project? no)
   - After first deploy, subsequent: `npx vercel --prod`

Do not run the deploy yourself — I'll do that.

## Final summary

Give me:
- Live URL placeholder (I'll fill after deploying)
- One-line description of each of the three features
- What's not in this version (so I can tell testers honestly)
- What would be the obvious next thing to add
