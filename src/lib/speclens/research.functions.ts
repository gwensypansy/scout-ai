import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `SYSTEM PROMPT — SpecLens Competitive Research Assistant

You are a competitive research assistant helping product managers analyze how competitors have built a specific feature area.

When a user provides competitor names, seed URLs, a feature area label, and (for Stage 2 only) a list of confirmed attributes, you will run the following steps:

---

STEP 1 — CRAWL SEED URLS

Read each seed URL provided. From each page, identify additional relevant internal links (same domain only — ignore navigation menus, external domains, training sites, and community forums) that likely contain more detail about the feature area. Fetch those additional pages. Target 3-5 additional pages per seed URL unless the user has specified a different crawl depth.

STEP 2 — SUPPLEMENT WITH WEB RESEARCH

Search the web for additional sources the user may have missed — help docs, support articles, best-practice guides, and changelogs for each competitor scoped to the feature area. Changelogs and release notes are valid sources for confirming or enriching product attributes. Extract only what the product currently does based on what has shipped. Do not infer strategic direction or roadmap intent from changelog patterns — only extract confirmed shipped behavior.

STEP 3 — ATTRIBUTE DISCOVERY (Stage 1 — only run if attributes have NOT been confirmed by the user)

Based on the feature area and what you find across sources, suggest a set of 6-10 attributes that meaningfully differentiate how competitors have approached this feature. Format them as a list with a one-line description of each. Return this list only — do not proceed to extraction. Wait for the user to approve, edit, or add to this list before Stage 2 runs.

STEP 4 — EXTRACT (Stage 2 — only run once attributes have been confirmed)

For each competitor, extract every confirmed attribute. Also extract the following company-level attributes using general knowledge and web research — do not attempt to extract these from product docs:

- GTM motion: sales-led, PLG, or hybrid
- Company stage: startup, growth, or enterprise

CONFIDENCE SCORING:

For every extracted attribute assign a confidence level:

- High: explicitly stated in a source
- Medium: reasonably inferred from source context
- Low: not found in any source — return "not specified" rather than guessing

Never guess. Never fill in a value because it seems likely. If a source does not state something clearly, return "not specified" with low confidence. Do not default to "high" confidence to seem more useful — confidence should genuinely discriminate between well-sourced and weakly-sourced values.

STEP 5 — OUTPUT

For Stage 1 (attribute discovery), return:

{
  "suggested_attributes": [
    { "label": "string", "description": "string" }
  ]
}

For Stage 2 (extraction), return a structured JSON array — one object per competitor:

[
  {
    "company": "string",
    "sources_used": [
      { "url": "string", "source_type": "seed|crawled|web_search" }
    ],
    "company_attributes": {
      "gtm_motion": { "value": "string", "confidence": "high|medium|low" },
      "stage": { "value": "string", "confidence": "high|medium|low" }
    },
    "product_attributes": {
      "[attribute label]": {
        "value": "string",
        "confidence": "high|medium|low",
        "source_urls": ["string"]
      }
    },
    "key_insight": "One sentence — the most important pattern or tension a PM designing this feature should know about this competitor. Describe current confirmed behavior only — no directional or roadmap language."
  }
]

Return ONLY the JSON object — no markdown code fences, no commentary before or after, no explanation of what you did.

---

RULES

- Product attribute names in the JSON must exactly match the confirmed attribute list the user approved in Stage 1.
- Same-domain only when crawling. Do not follow links to external domains during the crawl step.
- Company-level attributes (GTM motion, stage) must come from web knowledge or search — never from product docs.
- If you cannot find meaningful content for a competitor, state this explicitly in key_insight rather than producing low-confidence extractions across the board.
- Do not include directional language ("they are moving toward X", "this signals Y") anywhere in the output.
- The key_insight field should describe current confirmed behavior only — not trend or direction.
- source_urls on each product attribute should list the specific source(s) that justified that exact value, not every source used for the competitor overall.`;

const MODEL = "google/gemini-2.5-pro";

function admin() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function tryParseJSON<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return JSON.parse(stripFences(text)) as T;
  }
}

async function fetchSeedText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; SpecLensBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `[fetch failed: HTTP ${res.status}]`;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 6000);
  } catch (e) {
    return `[fetch error: ${e instanceof Error ? e.message : String(e)}]`;
  }
}

type LoadedProject = {
  project: { id: string; name: string; feature_description: string | null };
  competitors: { id: string; name: string }[];
  sources: { id: string; competitor_id: string; url: string; source_type: string }[];
  attributes: { id: string; label: string; description: string | null; display_order: number; is_custom: boolean }[];
};

async function loadAll(projectId: string): Promise<LoadedProject> {
  const sb = admin();
  const { data: project, error: pErr } = await sb.from("projects").select("id,name,feature_description").eq("id", projectId).single();
  if (pErr || !project) throw new Error(pErr?.message ?? "project not found");
  const { data: competitors = [] } = await sb.from("competitors").select("id,name").eq("project_id", projectId).order("created_at");
  const compIds = (competitors ?? []).map((c) => c.id);
  const { data: sources = [] } = compIds.length
    ? await sb.from("sources").select("id,competitor_id,url,source_type").in("competitor_id", compIds)
    : { data: [] as LoadedProject["sources"] };
  const { data: attributes = [] } = await sb.from("attributes").select("id,label,description,display_order,is_custom").eq("project_id", projectId).order("display_order");
  return { project, competitors: competitors ?? [], sources: sources ?? [], attributes: attributes ?? [] };
}

async function buildUserMessage(loaded: LoadedProject, includeAttrs: boolean): Promise<string> {
  const lines: string[] = [];
  lines.push(`Feature area: ${loaded.project.name}`);
  if (loaded.project.feature_description) lines.push(`Description: ${loaded.project.feature_description}`);
  lines.push("");
  lines.push("Competitors and seed URLs (with excerpted text we already fetched server-side from the seed pages):");

  for (const comp of loaded.competitors) {
    const seeds = loaded.sources.filter((s) => s.competitor_id === comp.id && s.source_type === "seed");
    lines.push("");
    lines.push(`### ${comp.name}`);
    if (!seeds.length) {
      lines.push("(no seed URLs provided)");
      continue;
    }
    for (const s of seeds) {
      const excerpt = await fetchSeedText(s.url);
      lines.push(`- ${s.url}`);
      lines.push(`  EXCERPT: ${excerpt}`);
    }
  }

  if (includeAttrs) {
    lines.push("");
    lines.push("Confirmed attribute list (use these exact labels in product_attributes):");
    for (const a of loaded.attributes) {
      lines.push(`- ${a.label}${a.description ? `: ${a.description}` : ""}`);
    }
    lines.push("");
    lines.push("Run Stage 2 (Step 4 — extraction). Return ONLY the JSON array specified in the system prompt — no commentary, no code fences.");
  } else {
    lines.push("");
    lines.push("Run Stage 1 (Step 3 — attribute discovery). Return ONLY the JSON object with `suggested_attributes`. No code fences, no commentary.");
  }
  return lines.join("\n");
}

async function callModel(userMessage: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const gateway = createLovableAiGatewayProvider(key);
  const result = await generateText({
    model: gateway(MODEL),
    system: SYSTEM_PROMPT,
    prompt: userMessage,
  });
  return result.text ?? "";
}

/* ---------------- Stage 1 ---------------- */

export const runStage1 = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { projectId: string })
  .handler(async ({ data }) => {
    const sb = admin();
    await sb.from("projects").update({ status: "running", last_error: null, last_run_at: new Date().toISOString() }).eq("id", data.projectId);

    try {
      const loaded = await loadAll(data.projectId);
      const userMessage = await buildUserMessage(loaded, false);
      const raw = await callModel(userMessage);
      await sb.from("projects").update({ last_stage1_raw: raw }).eq("id", data.projectId);

      let parsed: { suggested_attributes?: { label: string; description?: string | null }[] };
      try {
        parsed = tryParseJSON(raw);
      } catch (e) {
        throw new Error(`Stage 1 response was not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
      const suggestions = Array.isArray(parsed?.suggested_attributes) ? parsed.suggested_attributes : [];
      // Roll status back to draft so the user goes through attribute confirmation in the wizard.
      await sb.from("projects").update({ status: "draft" }).eq("id", data.projectId);
      return { suggestions, raw };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("projects").update({ status: "draft", last_error: msg }).eq("id", data.projectId);
      throw new Error(msg);
    }
  });

/* ---------------- Stage 2 ---------------- */

type Stage2Source = { url: string; source_type?: string };
type Stage2Attr = { value?: string; confidence?: string; source_urls?: string[] };
type Stage2Item = {
  company: string;
  sources_used?: Stage2Source[];
  company_attributes?: Record<string, { value?: string; confidence?: string }>;
  product_attributes?: Record<string, Stage2Attr>;
  key_insight?: string;
};

function normConfidence(c?: string): "high" | "med" | "low" {
  const v = (c ?? "").toLowerCase();
  if (v === "high") return "high";
  if (v === "low") return "low";
  return "med";
}
function normSourceType(t?: string): "seed" | "crawled" | "web_search" {
  const v = (t ?? "").toLowerCase();
  if (v === "seed") return "seed";
  if (v === "crawled") return "crawled";
  return "web_search";
}

export const runStage2 = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { projectId: string; competitorIds?: string[]; attributeIds?: string[] })
  .handler(async ({ data }) => {
    const sb = admin();
    const compScoped = Array.isArray(data.competitorIds) && data.competitorIds.length > 0;
    const attrScoped = Array.isArray(data.attributeIds) && data.attributeIds.length > 0;
    const scoped = compScoped || attrScoped;
    if (!scoped) {
      await sb.from("projects").update({ status: "running", last_error: null, last_run_at: new Date().toISOString() }).eq("id", data.projectId);
    }

    try {
      // Make sure the two system attributes exist for this project (skip when re-extracting a specific attribute).
      const loaded0 = await loadAll(data.projectId);
      if (!attrScoped) {
        const haveGtm = loaded0.attributes.some((a) => a.label.toLowerCase() === "gtm motion");
        const haveStage = loaded0.attributes.some((a) => a.label.toLowerCase() === "stage");
        const nextOrder = (loaded0.attributes.reduce((m, a) => Math.max(m, a.display_order), -1)) + 1;
        const toInsert: { project_id: string; label: string; is_custom: boolean; display_order: number; description: string }[] = [];
        if (!haveGtm) toInsert.push({ project_id: data.projectId, label: "GTM motion", is_custom: false, display_order: nextOrder, description: "sales-led, PLG, or hybrid" });
        if (!haveStage) toInsert.push({ project_id: data.projectId, label: "Stage", is_custom: false, display_order: nextOrder + (haveGtm ? 0 : 1), description: "startup, growth, or enterprise" });
        if (toInsert.length) await sb.from("attributes").insert(toInsert);
      }

      const loadedFull = await loadAll(data.projectId);
      const compFilter = compScoped ? new Set(data.competitorIds) : null;
      const attrFilter = attrScoped ? new Set(data.attributeIds) : null;
      const loaded: LoadedProject = {
        ...loadedFull,
        competitors: compFilter ? loadedFull.competitors.filter((c) => compFilter.has(c.id)) : loadedFull.competitors,
        attributes: attrFilter ? loadedFull.attributes.filter((a) => attrFilter.has(a.id)) : loadedFull.attributes,
      };
      if (compScoped && loaded.competitors.length === 0) {
        return { raw: "", count: 0 };
      }
      if (attrScoped && loaded.attributes.length === 0) {
        return { raw: "", count: 0 };
      }
      const userMessage = await buildUserMessage(loaded, true);
      const raw = await callModel(userMessage);
      if (!scoped) await sb.from("projects").update({ last_stage2_raw: raw }).eq("id", data.projectId);


      let parsed: Stage2Item[];
      try {
        parsed = tryParseJSON<Stage2Item[]>(raw);
      } catch (e) {
        throw new Error(`Stage 2 response was not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!Array.isArray(parsed)) throw new Error("Stage 2 response was not a JSON array");

      const compByName = new Map(loaded.competitors.map((c) => [c.name.toLowerCase(), c]));
      const attrByLabel = new Map(loaded.attributes.map((a) => [a.label.toLowerCase(), a]));
      const gtmAttr = attrByLabel.get("gtm motion");
      const stageAttr = attrByLabel.get("stage");

      for (const item of parsed) {
        const comp = compByName.get((item.company ?? "").toLowerCase());
        if (!comp) continue;

        // key_insight on competitor
        if (item.key_insight) {
          await sb.from("competitors").update({ key_insight: item.key_insight }).eq("id", comp.id);
        }

        // sources_used: upsert each by (competitor_id, url)
        const sourcesForComp = loaded.sources.filter((s) => s.competitor_id === comp.id);
        const urlToSourceId = new Map(sourcesForComp.map((s) => [s.url, s.id]));
        for (const src of item.sources_used ?? []) {
          if (!src?.url) continue;
          if (!urlToSourceId.has(src.url)) {
            const { data: ins } = await sb
              .from("sources")
              .insert({ competitor_id: comp.id, url: src.url, source_type: normSourceType(src.source_type) })
              .select("id")
              .single();
            if (ins) urlToSourceId.set(src.url, ins.id);
          }
        }

        // company_attributes → GTM motion + Stage (no source links)
        const ca = item.company_attributes ?? {};
        if (gtmAttr && ca.gtm_motion?.value) {
          await sb.from("extracted_values").upsert(
            { attribute_id: gtmAttr.id, competitor_id: comp.id, value: ca.gtm_motion.value, confidence: normConfidence(ca.gtm_motion.confidence) },
            { onConflict: "attribute_id,competitor_id" },
          );
        }
        if (stageAttr && ca.stage?.value) {
          await sb.from("extracted_values").upsert(
            { attribute_id: stageAttr.id, competitor_id: comp.id, value: ca.stage.value, confidence: normConfidence(ca.stage.confidence) },
            { onConflict: "attribute_id,competitor_id" },
          );
        }

        // product_attributes
        for (const [label, payload] of Object.entries(item.product_attributes ?? {})) {
          const attr = attrByLabel.get(label.toLowerCase());
          if (!attr) continue;
          const { data: evRow } = await sb
            .from("extracted_values")
            .upsert(
              {
                attribute_id: attr.id,
                competitor_id: comp.id,
                value: payload?.value ?? "not specified",
                confidence: normConfidence(payload?.confidence),
              },
              { onConflict: "attribute_id,competitor_id" },
            )
            .select("id")
            .single();
          if (!evRow) continue;
          // Reset links for this cell, then add for each source_url
          await sb.from("extracted_value_sources").delete().eq("extracted_value_id", evRow.id);
          for (const url of payload?.source_urls ?? []) {
            let sid = urlToSourceId.get(url);
            if (!sid) {
              const { data: ins } = await sb
                .from("sources")
                .insert({ competitor_id: comp.id, url, source_type: "web_search" })
                .select("id")
                .single();
              if (ins) {
                sid = ins.id;
                urlToSourceId.set(url, sid);
              }
            }
            if (sid) await sb.from("extracted_value_sources").insert({ extracted_value_id: evRow.id, source_id: sid });
          }
        }
      }

      if (!scoped) {
        await sb.from("projects").update({ status: "ready", last_run_at: new Date().toISOString() }).eq("id", data.projectId);
      }
      return { raw, count: parsed.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!scoped) await sb.from("projects").update({ status: "draft", last_error: msg }).eq("id", data.projectId);
      throw new Error(msg);
    }
  });
