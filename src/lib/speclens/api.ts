import { supabase } from "@/integrations/supabase/client";

export type ProjectStatus = "draft" | "running" | "ready";
export type Confidence = "high" | "med" | "low" | "manual";
export type SourceType = "seed" | "crawled" | "web_search" | "added_manually";
export type CrawlDepth = "seed" | "shallow" | "full";

export type Project = {
  id: string;
  name: string;
  feature_description: string | null;
  status: ProjectStatus;
  crawl_depth: CrawlDepth;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
};

export type Competitor = { id: string; project_id: string; name: string; created_at: string };
export type Source = { id: string; competitor_id: string; url: string; source_type: SourceType; created_at: string };
export type Attribute = {
  id: string;
  project_id: string;
  label: string;
  description: string | null;
  is_custom: boolean;
  display_order: number;
};
export type ExtractedValue = {
  id: string;
  attribute_id: string;
  competitor_id: string;
  value: string;
  confidence: Confidence;
};
export type EvSource = { id: string; extracted_value_id: string; source_id: string };

export type ProjectSummary = Project & { competitor_count: number };

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const ids = (projects ?? []).map((p) => p.id);
  let counts: Record<string, number> = {};
  if (ids.length) {
    const { data: comps } = await supabase.from("competitors").select("project_id").in("project_id", ids);
    (comps ?? []).forEach((c) => { counts[c.project_id] = (counts[c.project_id] ?? 0) + 1; });
  }
  return (projects as Project[]).map((p) => ({ ...p, competitor_count: counts[p.id] ?? 0 }));
}

export async function createProject(): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: "Untitled project", status: "draft" })
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Project) ?? null;
}

export type ProjectData = {
  project: Project;
  competitors: Competitor[];
  sources: Source[];
  attributes: Attribute[];
  extractedValues: ExtractedValue[];
  evSources: EvSource[];
};

export async function loadProjectData(projectId: string): Promise<ProjectData | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const [{ data: competitors }, { data: attributes }] = await Promise.all([
    supabase.from("competitors").select("*").eq("project_id", projectId).order("created_at"),
    supabase.from("attributes").select("*").eq("project_id", projectId).order("display_order"),
  ]);
  const compIds = (competitors ?? []).map((c) => c.id);
  const attrIds = (attributes ?? []).map((a) => a.id);
  const [{ data: sources }, { data: extractedValues }] = await Promise.all([
    compIds.length
      ? supabase.from("sources").select("*").in("competitor_id", compIds).order("created_at")
      : Promise.resolve({ data: [] as Source[] }),
    attrIds.length
      ? supabase.from("extracted_values").select("*").in("attribute_id", attrIds)
      : Promise.resolve({ data: [] as ExtractedValue[] }),
  ]);
  const evIds = (extractedValues ?? []).map((e) => e.id);
  const { data: evSources } = evIds.length
    ? await supabase.from("extracted_value_sources").select("*").in("extracted_value_id", evIds)
    : { data: [] as EvSource[] };
  return {
    project,
    competitors: (competitors ?? []) as Competitor[],
    sources: (sources ?? []) as Source[],
    attributes: (attributes ?? []) as Attribute[],
    extractedValues: (extractedValues ?? []) as ExtractedValue[],
    evSources: (evSources ?? []) as EvSource[],
  };
}

export type OnboardingPayload = {
  featureArea: string;
  featureDescription: string;
  competitors: { name: string; urls: string }[];
  attrs: { label: string; description: string | null; is_custom: boolean }[];
};

// Complete onboarding: update project, insert competitors + seed sources + attributes.
// Returns the inserted competitors so we can immediately mock-extract.
export async function completeOnboarding(projectId: string, payload: OnboardingPayload) {
  const { error: pErr } = await supabase
    .from("projects")
    .update({
      name: payload.featureArea || "Untitled project",
      feature_description: payload.featureDescription || null,
      status: "running",
      last_run_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (pErr) throw pErr;

  const compRows = payload.competitors
    .filter((c) => c.name.trim())
    .map((c) => ({ project_id: projectId, name: c.name.trim() }));
  let insertedCompetitors: Competitor[] = [];
  if (compRows.length) {
    const { data, error } = await supabase.from("competitors").insert(compRows).select();
    if (error) throw error;
    insertedCompetitors = data as Competitor[];
  }

  // Seed URLs per competitor — split on whitespace/newlines/commas
  const seedRows: { competitor_id: string; url: string; source_type: SourceType }[] = [];
  insertedCompetitors.forEach((comp, i) => {
    const raw = payload.competitors[i]?.urls ?? "";
    raw
      .split(/[\s,]+/)
      .map((u) => u.trim())
      .filter(Boolean)
      .forEach((url) => seedRows.push({ competitor_id: comp.id, url, source_type: "seed" }));
  });
  let insertedSources: Source[] = [];
  if (seedRows.length) {
    const { data, error } = await supabase.from("sources").insert(seedRows).select();
    if (error) throw error;
    insertedSources = data as Source[];
  }

  const attrRows = payload.attrs.map((a, i) => ({
    project_id: projectId,
    label: a.label,
    description: a.description,
    is_custom: a.is_custom,
    display_order: i,
  }));
  let insertedAttrs: Attribute[] = [];
  if (attrRows.length) {
    const { data, error } = await supabase.from("attributes").insert(attrRows).select();
    if (error) throw error;
    insertedAttrs = data as Attribute[];
  }

  return { competitors: insertedCompetitors, sources: insertedSources, attributes: insertedAttrs };
}

// Mock extraction — writes a placeholder extracted_values row for every (attribute, competitor),
// linked to that competitor's seed sources. Replaces the actual Anthropic call (next step).
export async function mockExtractAll(projectId: string) {
  const data = await loadProjectData(projectId);
  if (!data) return;
  const { competitors, attributes, sources } = data;
  if (!attributes.length || !competitors.length) return;

  const rows = attributes.flatMap((a) =>
    competitors.map((c) => ({
      attribute_id: a.id,
      competitor_id: c.id,
      value: "Pending extraction",
      confidence: "med" as Confidence,
    })),
  );
  const { data: inserted, error } = await supabase
    .from("extracted_values")
    .upsert(rows, { onConflict: "attribute_id,competitor_id" })
    .select();
  if (error) throw error;

  // link each value to its competitor's seed sources
  const linkRows: { extracted_value_id: string; source_id: string }[] = [];
  (inserted as ExtractedValue[]).forEach((ev) => {
    sources
      .filter((s) => s.competitor_id === ev.competitor_id)
      .forEach((s) => linkRows.push({ extracted_value_id: ev.id, source_id: s.id }));
  });
  if (linkRows.length) {
    await supabase.from("extracted_value_sources").upsert(linkRows, { onConflict: "extracted_value_id,source_id" });
  }

  await supabase
    .from("projects")
    .update({ status: "ready", last_run_at: new Date().toISOString() })
    .eq("id", projectId);
}

export async function saveCellValue(
  attributeId: string,
  competitorId: string,
  value: string,
  confidence: Confidence,
) {
  const { error } = await supabase
    .from("extracted_values")
    .upsert(
      { attribute_id: attributeId, competitor_id: competitorId, value, confidence },
      { onConflict: "attribute_id,competitor_id" },
    );
  if (error) throw error;
}

export async function addSource(competitorId: string, url: string, type: SourceType = "added_manually") {
  const { error } = await supabase.from("sources").insert({ competitor_id: competitorId, url, source_type: type });
  if (error) throw error;
}

export async function addAttributeWithValues(
  projectId: string,
  label: string,
  competitorIds: string[],
  nextOrder: number,
) {
  const { data: attr, error } = await supabase
    .from("attributes")
    .insert({ project_id: projectId, label, is_custom: true, display_order: nextOrder })
    .select()
    .single();
  if (error) throw error;
  if (competitorIds.length) {
    const rows = competitorIds.map((cid) => ({
      attribute_id: (attr as Attribute).id,
      competitor_id: cid,
      value: "Pending extraction",
      confidence: "med" as Confidence,
    }));
    await supabase.from("extracted_values").insert(rows);
  }
}

// link the current cell's extracted_value to every existing source for the competitor (used by re-extract)
export async function relinkCellSources(extractedValueId: string, competitorId: string) {
  const { data: srcs } = await supabase.from("sources").select("id").eq("competitor_id", competitorId);
  await supabase.from("extracted_value_sources").delete().eq("extracted_value_id", extractedValueId);
  const rows = (srcs ?? []).map((s) => ({ extracted_value_id: extractedValueId, source_id: s.id }));
  if (rows.length) await supabase.from("extracted_value_sources").insert(rows);
}

export async function getExtractedValue(attributeId: string, competitorId: string) {
  const { data } = await supabase
    .from("extracted_values")
    .select("*")
    .eq("attribute_id", attributeId)
    .eq("competitor_id", competitorId)
    .maybeSingle();
  return (data as ExtractedValue) ?? null;
}
