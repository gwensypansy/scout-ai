# Recreate SpecLens prototype

Goal: stand up a clickable, frontend-only version of the 4-screen flow so we can iterate on the design and interactions before wiring any real crawling / AI. No backend yet, no Cloud, no AI calls — just realistic mock data and working navigation.

## Visual direction (from the attached prototype)

Pulled from the loading frame in the bundled HTML:
- Background: warm near-black `#262019`
- Surface / cream: `#fdf8ef`
- Accent (primary CTA, highlights): gold `#e0a437`
- Muted text: `#8c7d68` / `#5c5446`
- System UI font stack (`-apple-system, BlinkMacSystemFont, …`)

I'll port these into `src/styles.css` as semantic tokens (`--background`, `--card`, `--primary`, `--muted-foreground`, etc.) in both light source values and the existing dark scaffold, so components stay token-driven (no hardcoded hex in JSX).

## Screens & routes

File-based routing under `src/routes/`:

- `/` → **Setup** (`src/routes/index.tsx`)
  - Feature area name input ("Permissions")
  - Competitor list: add 2–6 rows, each with name + seed URL (add/remove)
  - Optional attributes (chips: add/remove free text)
  - Crawl depth selector (Shallow / Standard / Deep)
  - Primary CTA → navigates to `/research/:runId`
- `/research/$runId` → **Researching**
  - Live-feel progress: per-competitor steps (Reading seeds → Discovering pages → Web search → Suggesting attributes), animated with a fake timer
  - When "done": AI-suggested attribute list with approve / edit / remove, and a "Run extraction" CTA → `/results/:runId`
- `/results/$runId` → **Results**
  - Filterable comparison table: columns = attributes, rows = competitors
  - Each cell shows value + confidence badge (high / med / low) and source link icon
  - Top bar: filter by confidence, search, Export CSV (stub), Copy summary (stub)
  - Clicking a cell opens a side drawer (Refine entry point)
- `/refine/$runId` → **Refine** (also reachable from a Results cell)
  - Two modes in one screen: "Fix this attribute" (re-extract a single attribute across competitors) and "Add a new dimension" (define + extract)
  - Shows before/after diff per competitor, Save → back to Results

A small top nav (logo "SpecLens" + breadcrumb of current run) lives in a pathless layout `src/routes/_app.tsx` wrapping the four routes.

## Mock data

A single `src/lib/mock-run.ts` exports a sample "Permissions" run with 4 competitors (e.g. Linear, Notion, Figma, Asana), 6 attributes (Roles model, Custom roles, Granularity, Inheritance, Audit log, SCIM/SSO), values + confidences + fake source URLs. All four screens read from this so they feel consistent.

State is in-memory via a tiny Zustand store (or React context — Zustand if it stays simpler) so edits on Refine reflect on Results within the session. No persistence yet.

## Out of scope for this pass

- Real crawling, web search, or LLM calls
- Auth, accounts, saved runs
- Real CSV export / clipboard (buttons present but stubbed with a toast)
- Mobile polish (desktop-first; responsive only enough to not break)

## Technical notes

- TanStack Start, file-based routes, semantic Tailwind tokens only.
- New deps: `zustand` for the in-memory run store; reuse existing shadcn primitives where available, add `sonner` for toasts if not present.
- Each route file sets its own `head()` with a unique title/description.
- Loaders are trivial (read from the in-memory store); error/notFound boundaries kept on each route.

## After this lands

You review the recreated screens, call out the tweaks you want (copy, density, attribute UX, confidence visualization, etc.), then we iterate on design before touching real backend/AI work.
