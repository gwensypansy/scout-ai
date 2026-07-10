# Scout

**AI-powered competitive research for product managers.** Describe what you're building, add your competitors and sources, and Scout extracts structured attributes (pricing, features, positioning) into a side-by-side comparison table you can drop straight into a spec.

**Live app:** https://scoutt-ai.lovable.app

<img width="1917" height="982" alt="image" src="https://github.com/user-attachments/assets/95bb3eef-0f68-4bd4-8c60-18c205cb68fc" />


---


## The problem

Competitive information isn't scarce, it's unfiltered. A PM who owns a specific product area (a files tab, a commenting system, a permissions layer) doesn't need to know a competitor hired a new CFO. They need to know that the same competitor quietly shipped granular permission controls last month.

Today, PMs spend hours doing research to figure out how competitors have designed and released a specific feature. It involves trying out competitor products first-hand, reading news releases and help articles, consolidating the data and insights gathered manually to fit it nicely into a PRD to inform other stakeholders on the team. 

Existing tools (Klue, Crayon, Kompyte) are built for sales enablement, battle cards and broad company tracking, not for the PM asking "how has everyone approached comment threading, and what should I learn from it before I write this spec?"



## Who it's for

The area PM: someone at a Series B+ company who owns one slice of a larger product, monitors 2–5 direct competitors, and hits a wall at the moment competitive context matters most — right before writing a spec. Their core fear, from discovery conversations: designing a feature without knowing a competitor already shipped a better version. Scout, as built today, serves that pre-spec research moment.


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

- **Real-time alerts** — Scout is a point-in-time research tool today, not a tracker. Continuous monitoring will be in next iteration, so PMs can stay up to speed with updates from key competitors, and have a comparison table updated automatically when new features are shipped
- **In-document integrations** — surfacing competitive context inside Notion or Confluence while a PM writes requires earned trust; it's a later-stage capability, not an MVP one


## What's next

1. **Signal feed** — Competitor signal feed. The biggest planned addition: a filtered, chronological stream of competitor signals (launches, changelog entries, pricing changes) scoped to the PM's declared feature areas and competitors. Where today's comparison table answers "what exists," the feed answers "what's new" — a lightweight weekly check that keeps the PM current between research sessions. Each signal card carries competitor, feature-area tag, signal type, source, and a one-sentence summary, and can be tapped straight into an existing comparison table so the research workspace stays current without manual upkeep.
2. **Structured competitive briefs** — a PM declares "I'm designing a commenting system" and gets a cited, sectioned brief: approach taxonomy, permission models, UX patterns, known user complaints
3. **Cross-industry inspiration** — surfacing analogous patterns from adjacent industries (how Dropbox handles permission inheritance as inspiration for a construction SaaS files tab)


---

## Technical details

### Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19 + Vite 7)
- **Backend / DB:** Lovable Cloud (Supabase)
- **AI:** Lovable AI Gateway
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Hosting:** Lovable (published from this repo)
