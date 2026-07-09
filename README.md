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
