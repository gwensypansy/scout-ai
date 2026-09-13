import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  searchWithYou,
  searchForAttribute,
  YOU_COM_CONFIG,
} from "@/lib/you-com-integration";

const SYSTEM_PROMPT = `SYSTEM PROMPT — Scout Competitive Research Assistant

You are a competitive research assistant helping product managers analyze how competitors have built a specific feature area.

When a user provides competitor names, seed URLs, a feature area label, and (for Stage 2 only) a list of confirmed attributes, you will run the following steps:

---

STEP 1 — CRAWL SEED URLS

Scout has already fetched each seed page AND crawled additional same-domain pages linked from those seed pages (help docs, guides, feature pages, changelogs). All of that page text is supplied to you in the user message, labelled SEED or CRAWLED. Read all of it — the crawled pages often contain the specific detail the seed page only summarises. Do not ignore a page because it was crawled rather than pasted. When you cite a source, use its exact URL and mark source_type as "seed" or "crawled" accordingly.

STEP 2 — SUPPLEMENT WITH WEB RESEARCH

Search the web for additional sources the user may have missed — help docs, support articles, best-practice guides, and changelogs for each competitor scoped to the feature area. Changelogs and release notes are valid sources for confirming or enriching product attributes. Extract only what the product currently does based on what has shipped. Do not infer strategic direction or roadmap intent from changelog patterns — only extract confirmed shipped behavior.

STEP 3 — ATTRIBUTE DISCOVERY (Stage 1 — only run if attributes have NOT been confirmed by the user)

Based on the feature area and what you find across sources, suggest a set of 6-10 attributes that meaningfully differentiate how competitors have approached this feature. Format them as a list with a one-line description of each. Return this list only — do not proceed to extraction. Wait for the user to approve, edit, or add to this list before Stage 2 runs.

STEP 4 — EXTRACT (Stage 2 — only run once attributes have been confirmed)

For each competitor, extract every confirmed attribute.

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
- If you cannot find meaningful content for a competitor, state this explicitly in key_insight rather than producing low-confidence extractions across the board.
- Do not include directional language ("they are moving toward X", "this signals Y") anywhere in the output.
- The key_insight field should describe current confirmed behavior only — not trend or direction.
- source_urls on each product attribute should list the specific source(s) that justified that exact value, not every source used for the competitor overall.`;

const MODEL = "google/gemini-2.5-flash";
type ScoutDb = SupabaseClient<Database>;

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

const SEED_CHARS = 20000;
const CRAWL_CHARS = 9000;
const CRAWL_PER_SEED = 8;
const UA = "Mozilla/5.0 (compatible; ScoutBot/1.0)";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export type Page = { url: string; text: string; html: string; ok: boolean };

async function fetchPage(url: string, timeoutMs = 15000): Promise<Page> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { url, text: `[fetch failed: HTTP ${res.status}]`, html: "", ok: false };
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/html|xml|text/i.test(ct)) return { url, text: `[skipped: ${ct}]`, html: "", ok: false };
    const html = await res.text();
    return { url, text: htmlToText(html), html, ok: true };
  } catch (e) {
    return { url, text: `[fetch error: ${e instanceof Error ? e.message : String(e)}]`, html: "", ok: false };
  }
}

const SKIP_PATTERNS = /(login|signin|sign-up|signup|pricing\/?$|careers|jobs|legal|privacy|terms|cookie|\/blog\/(tag|author|category)\/|community|forum|events|webinar|partners|contact|\.(png|jpe?g|gif|svg|pdf|zip|css|js|ico|mp4|webp)(\?|$))/i;

/** Same-domain links from a page, ranked by how well they match the feature area. */
function rankLinks(page: Page, keywords: string[], limit: number): string[] {
  if (!page.html) return [];
  let base: URL;
  try {
    base = new URL(page.url);
  } catch {
    return [];
  }
  const scored = new Map<string, number>();
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page.html))) {
    const rawHref = m[1] ?? "";
    const anchorText = htmlToText(m[2] ?? "").toLowerCase();
    if (!rawHref || rawHref.startsWith("#") || /^(mailto|tel|javascript):/i.test(rawHref)) continue;
    let abs: URL;
    try {
      abs = new URL(rawHref, base);
    } catch {
      continue;
    }
    if (abs.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    abs.hash = "";
    const href = abs.toString();
    if (href === page.url) continue;
    if (SKIP_PATTERNS.test(href)) continue;

    const haystack = `${decodeURIComponent(abs.pathname).toLowerCase()} ${anchorText}`;
    let score = 0;
    for (const kw of keywords) if (kw.length > 2 && haystack.includes(kw)) score += 3;
    if (/\/(docs?|help|support|guide|guides|learn|documentation|kb|article|features?|product|changelog|release|whats-new|updates)\//i.test(abs.pathname)) score += 2;
    // Prefer pages that live near the seed page in the site hierarchy.
    const seedDir = base.pathname.split("/").slice(0, 3).join("/");
    if (seedDir.length > 1 && abs.pathname.startsWith(seedDir)) score += 2;
    if (score <= 0) continue;
    scored.set(href, Math.max(scored.get(href) ?? 0, score));
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([href]) => href);
}

function keywordsFor(loaded: LoadedProject): string[] {
  const stop = new Set(["the", "and", "for", "with", "how", "what", "does", "this", "that", "from", "into", "their", "our", "are", "can"]);
  const raw = `${loaded.project.name} ${loaded.project.feature_description ?? ""} ${loaded.attributes.map((a) => `${a.label} ${a.description ?? ""}`).join(" ")}`;
  return [...new Set(raw.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w)))].slice(0, 25);
}

/** Fetch a seed page, then fetch the most relevant same-domain pages linked from it. */
async function crawlFromSeed(
  seedUrl: string,
  keywords: string[],
  competitorName?: string,
  featureArea?: string
): Promise<{ seed: Page; children: Page[] }> {
  const seed = await fetchPage(seedUrl);
  if (!seed.ok) return { seed, children: [] };
  const links = rankLinks(seed, keywords, CRAWL_PER_SEED);
  const children = await Promise.all(links.map((u) => fetchPage(u, 12000)));
  const validChildren = children.filter((c) => c.ok && c.text.length > 400);

  // NEW: If seed crawl was weak, try You.com search as fallback
  if (
    validChildren.length < 3 &&
    YOU_COM_CONFIG.isConfigured &&
    competitorName &&
    featureArea
  ) {
    console.log(
      `[Seed crawl weak for ${competitorName}] Supplementing with You.com search...`
    );
    const youResults = await searchWithYou(competitorName, featureArea, 8);
    validChildren.push(...youResults);
  }

  return { seed, children: validChildren };
}

const DEEP_PER_COMP = 10;

/**
 * Second-pass crawl for low-confidence attributes: goes one link level deeper
 * (links found on the first-level crawled pages) and re-ranks everything using
 * keywords from the missing attributes themselves.
 */
async function crawlDeeper(seedUrls: string[], keywords: string[], exclude: Set<string>): Promise<Page[]> {
  const seeds = await Promise.all(seedUrls.map((u) => fetchPage(u, 12000)));
  const level1Links = new Set<string>();
  for (const seed of seeds.filter((s) => s.ok)) {
    for (const l of rankLinks(seed, keywords, CRAWL_PER_SEED * 2)) if (!exclude.has(l)) level1Links.add(l);
  }
  const level1 = await Promise.all([...level1Links].slice(0, 6).map((u) => fetchPage(u, 12000)));
  // Second level: links on the first-level pages, ranked with the same keywords.
  const level2Links = new Set<string>();
  for (const p of level1.filter((p) => p.ok)) {
    for (const l of rankLinks(p, keywords, DEEP_PER_COMP)) {
      if (!exclude.has(l) && !level1Links.has(l)) level2Links.add(l);
    }
  }
  const fresh = level1.filter((p) => p.ok && p.text.length > 400 && !exclude.has(p.url));
  const level2 = await Promise.all([...level2Links].slice(0, DEEP_PER_COMP).map((u) => fetchPage(u, 10000)));
  return [...fresh, ...level2.filter((p) => p.ok && p.text.length > 400)].slice(0, DEEP_PER_COMP + 4);
}


type LoadedProject = {
  project: { id: string; name: string; feature_description: string | null };
  competitors: { id: string; name: string }[];
  sources: { id: string; competitor_id: string; url: string; source_type: string }[];
  attributes: { id: string; label: string; description: string | null; display_order: number; is_custom: boolean }[];
};

async function loadAll(sb: ScoutDb, projectId: string): Promise<LoadedProject> {
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

async function buildUserMessage(sb: ScoutDb, loaded: LoadedProject, includeAttrs: boolean): Promise<string> {
  const lines: string[] = [];
  const keywords = keywordsFor(loaded);
  lines.push(`Feature area: ${loaded.project.name}`);
  if (loaded.project.feature_description) lines.push(`Description: ${loaded.project.feature_description}`);
  lines.push("");
  lines.push(
    "Below is page text Scout already fetched server-side: each competitor's seed pages plus additional same-domain pages Scout crawled from links on those seed pages. Treat this fetched text as your primary evidence — you do not need to (and cannot) fetch these URLs yourself. Use every page listed, not just the seed pages.",
  );

  for (const comp of loaded.competitors) {
    const seeds = loaded.sources.filter((s) => s.competitor_id === comp.id && s.source_type === "seed");
    lines.push("");
    lines.push(`### ${comp.name}`);
    if (!seeds.length) {
      lines.push("(no seed URLs provided)");
      continue;
    }
    const known = new Set(loaded.sources.filter((s) => s.competitor_id === comp.id).map((s) => s.url));
    const crawls = await Promise.all(
      seeds.map((s) =>
        crawlFromSeed(s.url, keywords, comp.name, loaded.project.feature_description ?? "")
      )
    );
    for (const { seed, children } of crawls) {
      lines.push(`- SEED ${seed.url}`);
      lines.push(`  TEXT: ${seed.text.slice(0, SEED_CHARS)}`);
      for (const child of children) {
        lines.push(`  - CRAWLED ${child.url}`);
        lines.push(`    TEXT: ${child.text.slice(0, CRAWL_CHARS)}`);
        if (!known.has(child.url)) {
          known.add(child.url);
          await sb.from("sources").insert({ competitor_id: comp.id, url: child.url, source_type: "crawled" });
        }
      }
      if (!children.length) lines.push("  (no additional relevant pages found from this seed)");
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await sb.from("projects").update({ status: "running", last_error: null, last_run_at: new Date().toISOString() }).eq("id", data.projectId);

    try {
      const loaded = await loadAll(sb, data.projectId);
      const userMessage = await buildUserMessage(sb, loaded, false);
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

/**
 * Second pass: for every product attribute that came back low confidence (or
 * "not specified"), crawl deeper on that competitor's domains — one link level
 * further, re-ranked by the missing attributes' own keywords — then re-ask the
 * model to re-extract just those attributes with the new pages. Improved values
 * are merged into `parsed` in place.
 */
async function digDeeper(sb: ScoutDb, loaded: LoadedProject, parsed: Stage2Item[]): Promise<void> {
  const compByName = new Map(loaded.competitors.map((c) => [c.name.toLowerCase(), c]));
  const jobs: { comp: LoadedProject["competitors"][number]; item: Stage2Item; missing: string[] }[] = [];

  for (const item of parsed) {
    const comp = compByName.get((item.company ?? "").toLowerCase());
    if (!comp) continue;
    const missing = Object.entries(item.product_attributes ?? {})
      .filter(([, p]) => normConfidence(p?.confidence) === "low" || (p?.value ?? "").toLowerCase() === "not specified")
      .map(([label]) => label);
    if (missing.length) jobs.push({ comp, item, missing });
  }
  if (!jobs.length) return;

  await Promise.all(
    jobs.map(async ({ comp, item, missing }) => {
      try {
        const seeds = loaded.sources.filter((s) => s.competitor_id === comp.id && s.source_type === "seed").map((s) => s.url);
        if (!seeds.length) return;
        const exclude = new Set(loaded.sources.filter((s) => s.competitor_id === comp.id).map((s) => s.url));
        const attrKeywords = missing
          .flatMap((label) => {
            const a = loaded.attributes.find((x) => x.label === label);
            return `${label} ${a?.description ?? ""}`;
          })
          .join(" ")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 3);
        let pages = await crawlDeeper(
          seeds,
          [...new Set(attrKeywords)].slice(0, 15),
          exclude
        );

        // NEW: If crawlDeeper didn't find much, try You.com
        if (
          pages.length < 3 &&
          YOU_COM_CONFIG.isConfigured &&
          missing.length > 0
        ) {
          console.log(
            `[Deep dive weak for ${comp.name} on ${missing[0]}] Trying You.com...`
          );

          const firstMissingLabel = missing[0];
          const firstMissingAttr = loaded.attributes.find(
            (a) => a.label === firstMissingLabel
          );

          if (firstMissingAttr) {
            const youResults = await searchForAttribute(
              comp.name,
              firstMissingLabel,
              firstMissingAttr.description || undefined
            );
            pages = [...pages, ...youResults].slice(0, 12);

            for (const p of youResults) {
              if (!exclude.has(p.url)) {
                exclude.add(p.url);
                await sb.from("sources").insert({
                  competitor_id: comp.id,
                  url: p.url,
                  source_type: "crawled",
                });
              }
            }
          }
        }

        if (!pages.length) return;

        // Record the new pages as crawled sources so cells can link to them.
        for (const p of pages) {
          if (!exclude.has(p.url)) {
            exclude.add(p.url);
            await sb.from("sources").insert({ competitor_id: comp.id, url: p.url, source_type: "crawled" });
          }
        }

        const lines: string[] = [];
        lines.push(`Feature area: ${loaded.project.name}`);
        lines.push("");
        lines.push(
          `This is a follow-up extraction for ${comp.name} ONLY. A first pass could not find these attributes in any source, so additional pages were fetched from deeper in ${comp.name}'s site. Re-extract ONLY the attributes listed below, using the new page text as evidence. Rules: (1) the "value" must be a concrete, specific answer drawn from the new page text — never a rephrasing of "not specified"; (2) if the new pages still do not cover an attribute, return value "not specified" with confidence "low" and an empty source_urls — do NOT raise confidence without evidence; (3) "high" confidence requires the fact to be explicitly stated on a page you list in source_urls, and every source_urls entry must be one of the CRAWLED URLs below. Keep the same JSON array shape as Stage 2, with a single object for ${comp.name}, and only the listed attributes in product_attributes.`,
        );
        lines.push("");
        lines.push("Attributes to re-extract:");
        for (const label of missing) {
          const a = loaded.attributes.find((x) => x.label === label);
          lines.push(`- ${label}${a?.description ? `: ${a.description}` : ""}`);
        }
        lines.push("");
        for (const p of pages) {
          lines.push(`- CRAWLED ${p.url}`);
          lines.push(`  TEXT: ${p.text.slice(0, CRAWL_CHARS)}`);
        }
        const raw = await callModel(lines.join("\n"));
        let followUp: Stage2Item[];
        try {
          followUp = tryParseJSON<Stage2Item[]>(raw);
        } catch {
          return; // keep the original low-confidence values
        }
        const upd = Array.isArray(followUp) ? followUp[0] : undefined;
        if (!upd?.product_attributes) return;
        const isEmptyish = (v?: string) => {
          const s = (v ?? "").trim().toLowerCase();
          return (
            s.length < 3 ||
            s === "n/a" ||
            s === "none" ||
            s === "unknown" ||
            s === "unclear" ||
            s === "not specified" ||
            s === "not stated" ||
            s === "not mentioned" ||
            s === "not found" ||
            s.startsWith("not specified") ||
            s.startsWith("no information")
          );
        };
        const normText = (v?: string) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.]+$/, "");

        for (const label of missing) {
          const next = upd.product_attributes[label];
          const prev = item.product_attributes?.[label];
          if (!next?.value) continue;
          // The deeper pass must actually produce NEW substance — not just a
          // higher confidence on the same (or still-empty) text.
          if (isEmptyish(next.value)) continue;
          if (prev && normText(next.value) === normText(prev.value)) continue;
          const prevWasWeak =
            !prev || normConfidence(prev.confidence) === "low" || isEmptyish(prev.value);
          if (!prevWasWeak) continue;
          // Confidence is capped at "medium" unless the model cites a source page.
          const cited = (next.source_urls ?? []).length > 0;
          const conf = normConfidence(next.confidence);
          item.product_attributes = item.product_attributes ?? {};
          item.product_attributes[label] = {
            value: next.value,
            confidence: cited ? conf : conf === "high" ? "medium" : conf,
            source_urls: next.source_urls?.length ? next.source_urls : pages.slice(0, 3).map((p) => p.url),
          };
        }

      } catch {
        // Deep-dive is best-effort; failures leave the original values untouched.
      }
    }),
  );
}

export const runStage2 = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { projectId: string; competitorIds?: string[]; attributeIds?: string[] })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const compScoped = Array.isArray(data.competitorIds) && data.competitorIds.length > 0;
    const attrScoped = Array.isArray(data.attributeIds) && data.attributeIds.length > 0;
    const scoped = compScoped || attrScoped;
    if (!scoped) {
      await sb.from("projects").update({ status: "running", last_error: null, last_run_at: new Date().toISOString() }).eq("id", data.projectId);
    }

    try {
      const loadedFull = await loadAll(sb, data.projectId);
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
      const userMessage = await buildUserMessage(sb, loaded, true);
      const raw = await callModel(userMessage);
      if (!scoped) await sb.from("projects").update({ last_stage2_raw: raw }).eq("id", data.projectId);


      let parsed: Stage2Item[];
      try {
        parsed = tryParseJSON<Stage2Item[]>(raw);
      } catch (e) {
        throw new Error(`Stage 2 response was not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!Array.isArray(parsed)) throw new Error("Stage 2 response was not a JSON array");

      await digDeeper(sb, loaded, parsed);

      const compByName = new Map(loaded.competitors.map((c) => [c.name.toLowerCase(), c]));
      const attrByLabel = new Map(loaded.attributes.map((a) => [a.label.toLowerCase(), a]));

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
