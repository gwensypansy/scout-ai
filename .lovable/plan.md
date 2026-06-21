## SpecLens — Supabase data layer (step 1)

Goal: port the existing prototype into React so it can talk to Supabase, create the schema you specified, and wire every state mutation to the database. No visual changes. No Anthropic call yet — extraction stays mocked but writes real rows.

### 1. Enable Lovable Cloud
Provisions Supabase (Postgres + auth + storage) behind the scenes. No external account needed.

### 2. Port the prototype into React
The prototype currently lives in `src/assets/speclens-prototype.html` and is rendered inside an `<iframe srcDoc>`. To use the Supabase client (and later Anthropic, auth, exports, etc.) it needs to be real React.

Approach: copy the existing CSS verbatim into `src/styles.css` (scoped under a wrapper class so it can't leak), and port the screens 1:1 into components/routes:
- `/` — Empty / project list (left rail + empty state)
- `/project/$projectId/setup` — onboarding wizard (3 steps)
- `/project/$projectId/research` — running state
- `/project/$projectId/results` — comparison table
- Cell-detail drawer and Add-attribute drawer as overlay components

Same DOM structure, same class names, same markup — pixel-identical output. Just driven by React state + Supabase instead of inline JS.

The old `speclens-prototype.html` file stays in the repo for reference but is no longer rendered.

### 3. Database schema
Exactly the 6 tables you specified:
`projects`, `competitors`, `sources`, `attributes`, `extracted_values`, `extracted_value_sources`, with the constraints, FKs, cascades, and the unique `(attribute_id, competitor_id)` on `extracted_values`.

RLS is **enabled** on all tables, but because we're in single-user dev mode the policies are temporarily permissive (`USING (true) WITH CHECK (true)` for `anon` + `authenticated`). When we add auth in a later step, these get swapped for the `auth.uid() = projects.user_id` policies in your spec. `projects.user_id` stays in the schema as nullable for now so the future switch is a one-migration change.

Standard `GRANT SELECT, INSERT, UPDATE, DELETE` for `anon` + `authenticated`, `GRANT ALL` for `service_role`.

### 4. Wire the UI to the data
| UI action | DB effect |
|---|---|
| App load | `select * from projects order by updated_at desc` → sidebar |
| "+ New project" | `insert into projects (status='draft')`, navigate to setup |
| Complete onboarding | update `projects` (name, feature_description, crawl_depth, status='running', last_run_at), bulk-insert `competitors`, bulk-insert `sources` (type='seed') per competitor, bulk-insert confirmed `attributes` (is_custom flag set correctly, display_order assigned) |
| Research "completes" (mocked timer, same as today) | insert placeholder `extracted_values` rows for every (attribute × competitor) with `confidence='med'` and a mock value, link each to the seed sources via `extracted_value_sources`; set `projects.status='ready'` |
| Click cell → Re-extract | upsert the matching `extracted_values` row, refresh `extracted_value_sources` |
| Add source in refine drawer | `insert into sources (source_type='added_manually')` |
| "+ Add attribute" | `insert into attributes` (is_custom=true, next display_order), then insert `extracted_values` for targeted competitors |
| Results table | join `attributes` + `extracted_values` + `extracted_value_sources` + `sources` for the active project |

All reads go through TanStack Query so the table refreshes after a mutation without a page reload.

### 5. Verification I'll show you
- A short list of how to open the Cloud → Tables view to inspect each table
- Confirmation that after creating a project + completing onboarding + refreshing the page, the project (with competitors, sources, attributes, and mock extracted values) is still there

### Out of scope for this step
- Auth / login (deferred per your answer)
- Real Anthropic extraction call
- Export / copy-summary backend
- Crawling beyond storing the seed URLs

### Technical notes
- Stack: TanStack Start + TanStack Query + Supabase JS (browser client, since we're skipping auth this step)
- Mutations live in a `src/lib/speclens/` module, one file per table for clarity
- Mock extraction happens client-side in a `setTimeout`, same UX as today, but writes real rows on completion
- A constant `DEV_USER_ID` (nullable column for now) makes the eventual auth swap trivial
