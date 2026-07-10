# Scout

**AI-powered competitive research for product managers.** Describe what you're building, add your competitors and sources, and Scout extracts structured attributes (pricing, features, positioning) into a side-by-side comparison table you can drop straight into a spec.

**Live app:** https://scoutt-ai.lovable.app · **Full product spec:** INSERT SPEC

<img width="1917" height="982" alt="image" src="https://github.com/user-attachments/assets/95bb3eef-0f68-4bd4-8c60-18c205cb68fc" />


---

## The problem

Competitive information isn't scarce, it's unfiltered. A PM who owns a specific product area (a files tab, a commenting system, a permissions layer) doesn't need to know a competitor hired a new CFO. They need to know that the same competitor quietly shipped granular permission controls last month.

Today, PMs have two bad options: spend 3–5 hours a week manually scanning newsletters, changelogs, and forums hoping to catch the right signals — or skip it and design features against a stale mental model of the market. The expensive failure isn't being passively uninformed; it's actively speccing a feature without knowing how six competitors already approached the same problem, and repeating mistakes the market has already road-tested.

Existing tools (Klue, Crayon, Kompyte) are built for sales enablement — battle cards and broad company tracking — not for the PM asking "how has everyone approached comment threading, and what should I learn from it before I write this spec?"

## Who it's for

The **area PM**: someone at a Series B+ company who owns one slice of a larger product, monitors 2–5 direct competitors, and needs research at two moments — a lightweight weekly check to stay current, and a deep-dive right before writing a spec. Their core fear, from discovery conversations: designing a feature without knowing a competitor already shipped a better version.

## What Scout does

- **Project-based research** — create a project per product area or market you're researching
- **Competitor tracking** — add competitors by name and seed URLs
- **AI attribute extraction** — Scout suggests the attributes worth comparing, then extracts values from competitor websites and sources
- **Comparison table** — a matrix of competitors × attributes, with confidence scores and source links on every cell
- **Refine on demand** — re-extract a single cell, add custom attributes, or add new sources at any time

## Key product decisions

A few choices that shaped the build, and the reasoning behind them:

**AI suggests, the user approves.** The hardest design question was who defines the comparison dimensions. Fully AI-inferred taxonomy is magical but unpredictable; fully user-defined is controlled but high-friction. Scout takes the hybrid path — AI proposes attributes and extracted values, the PM confirms or edits. Intelligence without loss of control.

**Confidence scores and source links on every cell.** A misclassified competitor approach is worse than a blank cell — a PM who designs against false intelligence has been actively harmed by the tool. Every extracted value links back to its source so claims can be verified before they inform a decision.

**Current state over recency.** The MVP answers "what exists today across my competitors," not "what just happened." A live signal feed is on the roadmap, but the pre-spec research moment is where the tool earns trust first.

## What I deliberately left out (for now)

- **Real-time alerts** — the target user is served by on-demand research and a weekly cadence; push alerts serve a different persona (the niche founder fearing an existential competitor move) and come later
- **Team collaboration** — comments, shared editing, assignments. The individual PM workflow has to be proven before layering on team features
- **In-document integrations** — surfacing competitive context inside Notion or Confluence while a PM writes requires earned trust; it's a later-stage capability, not an MVP one
- **Battle cards / sales enablement** — deliberately not the wedge; that market is well-served and it's not the PM's problem

## How I'd measure success

Not opens or sign-ups — **downstream action**. The metric that matters is whether a research output makes it into real work: an export pasted into a spec, a comparison shared with a teammate. "Tool was opened" is a vanity metric if the PM opens it and closes it; the instrumentation should capture output-adjacent moments.

## What's next

1. **Signal feed** — a filtered, chronological stream of competitor changes scoped to the PM's declared feature areas, feeding directly into the comparison workspace
2. **Structured competitive briefs** — a PM declares "I'm designing a commenting system" and gets a cited, sectioned brief: approach taxonomy, permission models, UX patterns, known user complaints
3. **Cross-industry inspiration** — surfacing analogous patterns from adjacent industries (how Dropbox handles permission inheritance as inspiration for a construction SaaS files tab)

The full reasoning, personas, metrics targets, and open questions are in the [PRD](./docs/PRD.md).

---

## Technical details

### Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19 + Vite 7)
- **Backend / DB:** Lovable Cloud (Supabase)
- **AI:** Lovable AI Gateway
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Hosting:** Lovable (published from this repo)

### Local development

Note: this repo is synced with a Lovable project. To run it yourself you'll need your own Lovable Cloud project and to apply the migrations in `supabase/`.

Prerequisites: [Bun](https://bun.sh) (or Node + npm) and a Lovable project with Cloud enabled.

```bash
bun install
cp .env.example .env   # fill in values from your Lovable project settings
bun dev                # app runs at http://localhost:8080
```

Environment variables expected:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
LOVABLE_API_KEY=
```

Build for production with `bun run build`.

### Project structure

```
src/
  routes/                 # TanStack file-based routes
    __root.tsx            # Root layout / app shell
    index.tsx             # Home / project list and onboarding wizard
  components/             # Reusable UI components
  lib/
    scout/                # Scout-specific data layer and research logic
  integrations/supabase/  # Auto-generated Supabase client and auth helpers
```

| Route | Purpose |
| --- | --- |
| `/` | Project list and new-project onboarding wizard |
| `/project/$projectId/setup` | Onboarding steps for a draft project |
| `/project/$projectId/research` | Running research state |
| `/project/$projectId/results` | Comparison table and refinement UI |

### Deployment

Pushing to the default branch updates the Lovable preview; publishing from the Lovable editor deploys to https://scoutt-ai.lovable.app.

## License

MIT — see [LICENSE](./LICENSE).






# Scout

Scout is an AI-powered competitive research tool. Describe what you're building, add your competitors and the sources you want analyzed, and Scout extracts structured attributes—pricing, features, positioning, and more—into a side-by-side comparison table.

**Live URL:** https://scoutt-ai.lovable.app

## What it does

- **Project-based research:** Create a project for each product or market you want to research.
- **Competitor tracking:** Add competitors by name and seed URLs.
- **AI attribute extraction:** Scout suggests attributes to compare, then extracts values from competitor websites and sources.
- **Comparison table:** View results in a matrix of competitors × attributes, with confidence scores and source links.
- **Refine on demand:** Re-extract a single cell, add custom attributes, or add new sources at any time.

## Tech stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19 + Vite 7)
- **Backend / Database:** Lovable Cloud (Supabase)
- **AI:** Lovable AI Gateway
- **Styling:** Tailwind CSS v4 + shadcn/ui components
- **Hosting:** Lovable (published from this repo)

## Local development

### Prerequisites

- [Bun](https://bun.sh) (or Node + npm)
- A Lovable project with Cloud enabled

### Install dependencies

```bash
bun install
```

### Environment variables

Copy `.env` values from your Lovable project settings. The app expects at least:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
LOVABLE_API_KEY=
```

### Run the dev server

```bash
bun dev
```

The app will be available at `http://localhost:8080`.

### Build for production

```bash
bun run build
```

## Project structure

```text
src/
  routes/                 # TanStack file-based routes
    __root.tsx            # Root layout / app shell
    index.tsx             # Home / project list and onboarding wizard
  components/             # Reusable UI components
  lib/                    # Utilities, API clients, and server functions
    scout/                # Scout-specific data layer and research logic
  integrations/supabase/  # Auto-generated Supabase client and auth helpers
  styles.css              # Global Tailwind/theme styles
  styles/scout.css        # Scout-specific UI styles
```

## Key routes

| Route | Purpose |
|-------|---------|
| `/` | Project list and new-project onboarding wizard |
| `/project/$projectId/setup` | Onboarding steps for an existing draft project |
| `/project/$projectId/research` | Running research state |
| `/project/$projectId/results` | Comparison table and refinement UI |

## Deployment

This repo is synced with Lovable. Pushing changes to the default branch on GitHub automatically updates the Lovable preview. Publishing from the Lovable editor deploys to:

```text
https://scoutt-ai.lovable.app
```

## License

MIT
