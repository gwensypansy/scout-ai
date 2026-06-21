import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import "@/styles/speclens.css";
import {
  addAttributeWithValues,
  addSource,
  completeOnboarding,
  createProject,
  getExtractedValue,
  listProjects,
  loadProjectData,
  mockExtractAll,
  relinkCellSources,
  saveCellValue,
  type Confidence,
  type ProjectData,
  type ProjectSummary,
  type SourceType,
} from "@/lib/speclens/api";
import { suggestedAttrsFor, type SuggestedAttr } from "@/lib/speclens/suggested-attrs";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "SpecLens — competitive research for product managers" },
      {
        name: "description",
        content:
          "Turn messy competitor docs into a structured, attribute-tagged comparison table before you write your spec.",
      },
    ],
  }),
  component: SpecLensPage,
});

type Tab = "setup" | "researching" | "results";

const CONF: Record<Confidence, { bg: string; color: string; label: string }> = {
  high: { bg: "#e7efdd", color: "#4a6b32", label: "HIGH" },
  med: { bg: "#fce9c8", color: "#9a6516", label: "MED" },
  low: { bg: "#f8ded4", color: "#a8432a", label: "LOW" },
  manual: { bg: "#e3e8f5", color: "#3a4a8c", label: "EDITED" },
};

const SOURCE_BADGE: Record<SourceType, { bg: string; color: string; label: string }> = {
  seed: { bg: "#e7efdd", color: "#4a6b32", label: "SEED" },
  crawled: { bg: "#ece7f7", color: "#6d5bc0", label: "CRAWLED" },
  web_search: { bg: "#ece7f7", color: "#6d5bc0", label: "WEB" },
  added_manually: { bg: "#fce9c8", color: "#9a6516", label: "ADDED" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function SpecLensPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("setup");
  const [data, setData] = useState<ProjectData | null>(null);

  // wizard ephemeral state
  const [step, setStep] = useState(0);
  const [featureArea, setFeatureArea] = useState("");
  const [featureDescription, setFeatureDescription] = useState("");
  const [wizCompetitors, setWizCompetitors] = useState<{ name: string; urls: string }[]>([{ name: "", urls: "" }]);
  const [attrs, setAttrs] = useState<string[] | null>(null);
  const [newAttr, setNewAttr] = useState("");

  // drawer state
  const [refineTarget, setRefineTarget] = useState<{ competitorId: string; attributeId: string } | null>(null);
  const [refineEditValue, setRefineEditValue] = useState("");
  const [refineNewSource, setRefineNewSource] = useState("");
  const [refineBusy, setRefineBusy] = useState(false);

  const [showAddAttr, setShowAddAttr] = useState(false);
  const [addAttrName, setAddAttrName] = useState("");
  const [addAttrTargets, setAddAttrTargets] = useState<Record<string, boolean>>({});

  const [showSources, setShowSources] = useState(false);
  const [sourceDraft, setSourceDraft] = useState<Record<string, string>>({});

  // load project list
  async function refreshProjects(selectId?: string | null) {
    const list = await listProjects();
    setProjects(list);
    if (selectId !== undefined) setActiveId(selectId);
    else if (!activeId && list.length) setActiveId(list[0].id);
  }
  useEffect(() => {
    refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load active project data
  async function refreshData(id: string | null) {
    if (!id) { setData(null); return; }
    const d = await loadProjectData(id);
    setData(d);
    if (d) {
      if (d.project.status === "ready") setTab((t) => (t === "researching" ? "results" : t));
      // pre-fill wizard if draft (so refresh during setup keeps name/desc)
      if (d.project.status === "draft") {
        setStep(0);
        setFeatureArea(d.project.name === "Untitled project" ? "" : d.project.name);
        setFeatureDescription(d.project.feature_description ?? "");
        setWizCompetitors([{ name: "", urls: "" }]);
        setAttrs(null);
      }
    }
  }
  useEffect(() => {
    refreshData(activeId);
    // when switching project, default tab based on status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const activeProject = useMemo(() => projects.find((p) => p.id === activeId) ?? null, [projects, activeId]);

  // sidebar tab default
  useEffect(() => {
    if (!activeProject) return;
    if (activeProject.status === "ready") setTab("results");
    else if (activeProject.status === "running") setTab("researching");
    else setTab("setup");
  }, [activeProject?.id, activeProject?.status]);

  const suggestSet = useMemo<SuggestedAttr[]>(() => suggestedAttrsFor(featureArea), [featureArea]);
  const activeAttrs = attrs === null ? suggestSet.map((a) => a.name) : attrs;

  function canProceed() {
    if (step === 0) return !!featureArea.trim();
    if (step === 1) return wizCompetitors.some((c) => c.name.trim() && c.urls.trim());
    return true;
  }

  async function handleNew() {
    const p = await createProject();
    setStep(0); setFeatureArea(""); setFeatureDescription("");
    setWizCompetitors([{ name: "", urls: "" }]); setAttrs(null); setNewAttr("");
    setTab("setup");
    await refreshProjects(p.id);
  }

  async function handleComplete() {
    if (!activeId) return;
    const payload = {
      featureArea: featureArea.trim() || "Untitled project",
      featureDescription: featureDescription.trim(),
      competitors: wizCompetitors,
      attrs: activeAttrs.map((label) => {
        const meta = suggestSet.find((s) => s.name === label);
        return { label, description: meta?.desc ?? null, is_custom: !meta };
      }),
    };
    await completeOnboarding(activeId, payload);
    setTab("researching");
    await refreshProjects(activeId);
    await refreshData(activeId);
  }

  async function handleResearchDone() {
    if (!activeId) return;
    await mockExtractAll(activeId);
    setTab("results");
    await refreshProjects(activeId);
    await refreshData(activeId);
  }

  async function openRefine(competitorId: string, attributeId: string) {
    const ev = await getExtractedValue(attributeId, competitorId);
    setRefineEditValue(ev?.value ?? "");
    setRefineNewSource("");
    setRefineTarget({ competitorId, attributeId });
  }

  async function saveRefineValue() {
    if (!refineTarget) return;
    const v = refineEditValue.trim();
    if (!v) return;
    await saveCellValue(refineTarget.attributeId, refineTarget.competitorId, v, "manual");
    await refreshData(activeId);
  }

  async function addRefineSource() {
    if (!refineTarget) return;
    const url = refineNewSource.trim(); if (!url) return;
    await addSource(refineTarget.competitorId, url, "added_manually");
    setRefineNewSource("");
    await refreshData(activeId);
  }

  async function reextractRefine() {
    if (!refineTarget) return;
    setRefineBusy(true);
    // mock: bump confidence to high, re-link to all current sources
    const ev = await getExtractedValue(refineTarget.attributeId, refineTarget.competitorId);
    if (ev) {
      await saveCellValue(refineTarget.attributeId, refineTarget.competitorId, ev.value, "high");
      const fresh = await getExtractedValue(refineTarget.attributeId, refineTarget.competitorId);
      if (fresh) await relinkCellSources(fresh.id, refineTarget.competitorId);
    }
    setRefineBusy(false);
    await refreshData(activeId);
  }

  function openAddAttr() {
    const t: Record<string, boolean> = {};
    (data?.competitors ?? []).forEach((c) => { t[c.id] = true; });
    setAddAttrTargets(t); setAddAttrName(""); setShowAddAttr(true);
  }
  async function extractAttr() {
    if (!activeId || !data) return;
    const name = addAttrName.trim() || "New attribute";
    const targets = Object.entries(addAttrTargets).filter(([, v]) => v).map(([k]) => k);
    const nextOrder = (data.attributes.reduce((m, a) => Math.max(m, a.display_order), -1)) + 1;
    await addAttributeWithValues(activeId, name, targets, nextOrder);
    setShowAddAttr(false);
    await refreshData(activeId);
  }

  async function addPanelSource(competitorId: string) {
    const url = (sourceDraft[competitorId] ?? "").trim();
    if (!url) return;
    await addSource(competitorId, url, "added_manually");
    setSourceDraft((d) => ({ ...d, [competitorId]: "" }));
    await refreshData(activeId);
  }

  // ----------- render helpers -----------

  function projectMeta(p: ProjectSummary) {
    if (p.status === "draft") return "Draft · not started";
    if (p.status === "running") return `${p.competitor_count} competitors · researching…`;
    return `${p.competitor_count} competitors${p.last_run_at ? " · " + timeAgo(p.last_run_at) : ""}`;
  }

  const status = activeProject?.status ?? "draft";
  const showOnboarding = tab === "setup" && status === "draft";
  const showResearching = tab === "researching" || (tab === "setup" && status === "running");
  const showRecap = tab === "setup" && status === "ready";
  const showResults = tab === "results" && status === "ready";

  return (
    <div className="speclens-root">
      <div className="app">
        {/* sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">
            <span className="sidebar-dot" /><span className="sidebar-logo">SpecLens</span>
          </div>
          <div className="sidebar-newwrap">
            <button className="btn-new" onClick={handleNew}>+ New project</button>
          </div>
          <div className="sidebar-label">Your projects</div>
          <div className="sidebar-projects">
            {projects.map((p) => {
              const active = p.id === activeId;
              const dot = p.status === "ready" ? "#86b06a" : p.status === "running" ? "var(--accent)" : "#6e6253";
              return (
                <div key={p.id} className={"project-item" + (active ? " active" : "")} onClick={() => setActiveId(p.id)}>
                  <div className="project-row">
                    <span className="project-name">{p.name}</span>
                    <span className="project-dot" style={{ background: dot }} />
                  </div>
                  <div className="project-meta">{projectMeta(p)}</div>
                </div>
              );
            })}
          </div>
          <div className="sidebar-footer">One project per feature area you're researching</div>
        </div>

        {/* main */}
        <div className="main">
          <div className="topbar">
            <div className="topbar-left">
              <span className="topbar-title">{activeProject?.name ?? "SpecLens"}</span>
              {activeProject && (status === "running" || status === "ready") && (
                <span
                  className="status-badge"
                  style={
                    status === "running"
                      ? { background: "#fbecd2", color: "#9a6516" }
                      : { background: "#e7efdd", color: "#4a6b32" }
                  }
                >
                  {status === "running" ? "Running" : "Ready"}
                </span>
              )}
            </div>
            <div className="tabs">
              <div
                className={"tab" + (tab === "setup" || tab === "researching" ? " active" : "")}
                onClick={() => setTab("setup")}
              >
                ⚙ Setup
              </div>
              <div
                className={"tab" + (showResults ? " active" : "")}
                style={{ cursor: status === "ready" ? "pointer" : "default" }}
                onClick={() => status === "ready" && setTab("results")}
              >
                ▦ Results
                {status === "ready" && data && (
                  <span className="tab-count">{data.competitors.length}</span>
                )}
              </div>
            </div>
          </div>

          <div className="content">
            {!activeProject && (
              <div className="empty">
                <div>
                  <h2>Welcome to SpecLens</h2>
                  <p>Click "+ New project" in the sidebar to start your first competitive research run.</p>
                </div>
              </div>
            )}

            {activeProject && showOnboarding && (
              <Onboarding
                step={step}
                setStep={setStep}
                featureArea={featureArea}
                setFeatureArea={setFeatureArea}
                featureDescription={featureDescription}
                setFeatureDescription={setFeatureDescription}
                competitors={wizCompetitors}
                setCompetitors={setWizCompetitors}
                attrs={activeAttrs}
                setAttrs={(next) => setAttrs(next)}
                newAttr={newAttr}
                setNewAttr={setNewAttr}
                suggestSet={suggestSet}
                canProceed={canProceed()}
                onNext={() => { if (!canProceed()) return; if (step < 2) setStep(step + 1); else handleComplete(); }}
              />
            )}

            {activeProject && showResearching && (
              <Researching project={activeProject} onPreview={handleResearchDone} />
            )}

            {activeProject && showRecap && data && <Recap data={data} onView={() => setTab("results")} />}

            {activeProject && showResults && data && (
              <Results data={data} onOpenRefine={openRefine} onOpenAddAttr={openAddAttr} onOpenSources={() => setShowSources(true)} />
            )}
          </div>
        </div>
      </div>

      {/* drawers */}
      {refineTarget && data && (
        <RefineDrawer
          data={data}
          target={refineTarget}
          editValue={refineEditValue}
          setEditValue={setRefineEditValue}
          newSource={refineNewSource}
          setNewSource={setRefineNewSource}
          busy={refineBusy}
          onClose={() => setRefineTarget(null)}
          onSave={saveRefineValue}
          onAddSource={addRefineSource}
          onReextract={reextractRefine}
        />
      )}

      {showSources && data && (
        <SourcesPanel
          data={data}
          draft={sourceDraft}
          setDraft={setSourceDraft}
          onAdd={addPanelSource}
          onClose={() => setShowSources(false)}
        />
      )}

      {showAddAttr && data && (
        <AddAttrModal
          data={data}
          name={addAttrName}
          setName={setAddAttrName}
          targets={addAttrTargets}
          toggle={(id) => setAddAttrTargets((t) => ({ ...t, [id]: !t[id] }))}
          onClose={() => setShowAddAttr(false)}
          onExtract={extractAttr}
        />
      )}
    </div>
  );
}

/* ---------- Onboarding ---------- */
function Onboarding(props: {
  step: number; setStep: (n: number) => void;
  featureArea: string; setFeatureArea: (s: string) => void;
  featureDescription: string; setFeatureDescription: (s: string) => void;
  competitors: { name: string; urls: string }[]; setCompetitors: (c: { name: string; urls: string }[]) => void;
  attrs: string[]; setAttrs: (a: string[]) => void;
  newAttr: string; setNewAttr: (s: string) => void;
  suggestSet: SuggestedAttr[];
  canProceed: boolean; onNext: () => void;
}) {
  const { step, setStep, featureArea, setFeatureArea, featureDescription, setFeatureDescription,
    competitors, setCompetitors, attrs, setAttrs, newAttr, setNewAttr, suggestSet, canProceed, onNext } = props;

  const titles = ["What feature are you researching?", "Who are you comparing?", "Attributes to extract"];
  const subs = [
    "This tells the AI what to look for across every source it reads. You can rename it later.",
    "Add competitors and a few seed URLs each — the AI will crawl further from there.",
    "Define what to extract, or let the AI suggest dimensions once it's seen your sources.",
  ];

  function addCompetitor() { if (competitors.length < 6) setCompetitors([...competitors, { name: "", urls: "" }]); }
  function removeCompetitor(i: number) { setCompetitors(competitors.filter((_, idx) => idx !== i)); }
  function updateCompetitor(i: number, patch: Partial<{ name: string; urls: string }>) {
    setCompetitors(competitors.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function removeAttr(name: string) { setAttrs(attrs.filter((a) => a !== name)); }
  function addAttr() { const v = newAttr.trim(); if (v) { setAttrs([...attrs, v]); setNewAttr(""); } }

  return (
    <div className="screen"><div className="screen-inner">
      <div className="progress-dots">{[0, 1, 2].map((i) => <div key={i} className={"dot" + (step >= i ? " filled" : "")} />)}</div>
      <div className="step-label">Step {step + 1} of 3</div>
      <div className="step-title">{titles[step]}</div>
      <div className="step-sub">{subs[step]}</div>

      {step === 0 && (<>
        <div className="field">
          <label>Feature area</label>
          <input type="text" value={featureArea} onChange={(e) => setFeatureArea(e.target.value)} placeholder="e.g. Permissions, Commenting, Onboarding flows" />
          <div className="hint">This becomes your project name in the sidebar</div>
        </div>
        <div className="field">
          <label>Description <span className="opt">(optional)</span></label>
          <textarea value={featureDescription} onChange={(e) => setFeatureDescription(e.target.value)} placeholder="Add context that helps the AI search more precisely — specific workflows, edge cases, or anything you already know competitors handle differently." />
          <div className="hint">Helps the AI crawl and extract more accurately</div>
        </div>
      </>)}

      {step === 1 && (<>
        {competitors.map((c, i) => (
          <div key={i} className="competitor-card">
            <div className="competitor-head">
              <span className="competitor-num">Competitor {i + 1}</span>
              {competitors.length > 1 && <button className="remove-x" onClick={() => removeCompetitor(i)}>×</button>}
            </div>
            <label>Company name</label>
            <input type="text" value={c.name} onChange={(e) => updateCompetitor(i, { name: e.target.value })} placeholder="e.g. Procore" />
            <label>Seed URLs</label>
            <textarea value={c.urls} onChange={(e) => updateCompetitor(i, { urls: e.target.value })} placeholder="https://help.example.com/permissions" />
          </div>
        ))}
        {competitors.length < 6 && <button className="btn-dashed" onClick={addCompetitor}>+ Add competitor</button>}
      </>)}

      {step === 2 && (<>
        <div className="field">
          <label>Attributes to extract</label>
          <div className="note" style={{ marginBottom: 14 }}>
            <span>✦</span><span>Suggested for a "{featureArea || "this"}" comparison — hover a chip for what it means. Remove any that don't apply, or add your own.</span>
          </div>
          <div className="pills">
            {attrs.map((name) => {
              const meta = suggestSet.find((a) => a.name === name);
              return (
                <span key={name} className="pill" title={meta ? meta.desc : "Custom attribute"}>
                  {name}<span className="x" onClick={() => removeAttr(name)}>×</span>
                </span>
              );
            })}
          </div>
          <div className="add-row">
            <input type="text" value={newAttr} onChange={(e) => setNewAttr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addAttr(); }} placeholder="Add an attribute, e.g. Mobile support" />
            <button className="btn-soft" onClick={addAttr}>Add</button>
          </div>
        </div>
        <div className="field">
          <label>Research depth</label>
          <div className="note"><span>✦</span><span>Each seed URL is crawled one level deep automatically, so the AI also reads linked sub-pages your competitors didn't hand you directly.</span></div>
        </div>
      </>)}

      <div className="footer-nav">
        {step > 0 ? <button className="btn-back" onClick={() => setStep(step - 1)}>← Back</button> : <span />}
        <button
          className="btn-next"
          disabled={!canProceed}
          style={{
            background: canProceed ? "var(--accent)" : "#ece0c8",
            color: canProceed ? "#2a2218" : "#bcae97",
            cursor: canProceed ? "pointer" : "not-allowed",
          }}
          onClick={onNext}
        >
          {step < 2 ? "Continue →" : "Start research →"}
        </button>
      </div>
    </div></div>
  );
}

/* ---------- Researching ---------- */
function Researching({ project, onPreview }: { project: ProjectSummary; onPreview: () => void }) {
  const items = [
    { label: `Reading seed URLs`, status: "done", meta: "" },
    { label: "Discovering related pages (1 level deep)", status: "done", meta: "" },
    { label: "Searching the web for additional sources", status: "done", meta: "" },
    { label: "Extracting attributes per competitor", status: "active", meta: "" },
    { label: "Scoring confidence on each value", status: "pending", meta: "" },
    { label: "Assembling your comparison matrix", status: "pending", meta: "" },
  ] as const;
  return (
    <div className="screen"><div className="screen-inner">
      <div className="research-title">Researching {project.name}…</div>
      <div className="research-sub">{project.competitor_count} competitors · this usually takes 1–3 minutes</div>
      <div>
        {items.map((it, i) => {
          const icon = it.status === "done" ? "✓" : "";
          const iconBg = it.status === "done" ? "var(--accent)" : "transparent";
          const iconBorder = it.status === "done" ? "none" : it.status === "active" ? "2px solid var(--accent)" : "2px solid #ecdcbd";
          const labelColor = it.status === "pending" ? "#bcae97" : it.status === "active" ? "#2a2218" : "#3a3224";
          const labelWeight = it.status === "active" ? 600 : 400;
          return (
            <div key={i} className="research-item">
              <span className="research-icon" style={{ background: iconBg, border: iconBorder }}>{icon}</span>
              <span className="research-label" style={{ color: labelColor, fontWeight: labelWeight }}>{it.label}</span>
              <span className="research-meta">{it.meta}</span>
            </div>
          );
        })}
      </div>
      <button className="btn-primary" style={{ marginTop: 28 }} onClick={onPreview}>Preview results (demo) →</button>
      <div className="leave-note">
        <span style={{ color: "#9a6516", fontSize: 14 }}>✦</span>
        <span>You can leave this page — we'll mark the project ready in the sidebar when the matrix is done.</span>
      </div>
    </div></div>
  );
}

/* ---------- Recap ---------- */
function Recap({ data, onView }: { data: ProjectData; onView: () => void }) {
  const sourcesByComp = new Map<string, string[]>();
  data.sources.forEach((s) => {
    const arr = sourcesByComp.get(s.competitor_id) ?? [];
    arr.push(s.url); sourcesByComp.set(s.competitor_id, arr);
  });
  return (
    <div className="screen"><div className="screen-inner">
      <div className="recap-title">Research setup</div>
      <div className="recap-sub">What this comparison was built from. Edit anything and re-run to refresh the matrix.</div>
      <div className="recap-section">
        <div className="recap-label">Feature area</div>
        <div className="recap-box">{data.project.name}</div>
      </div>
      {data.project.feature_description && (
        <div className="recap-section">
          <div className="recap-label">Description</div>
          <div className="recap-box" style={{ fontWeight: 400, lineHeight: 1.55 }}>{data.project.feature_description}</div>
        </div>
      )}
      <div className="recap-section">
        <div className="recap-label">Competitors</div>
        {data.competitors.map((c) => (
          <div key={c.id} className="recap-competitor">
            <div className="recap-competitor-name">{c.name}</div>
            <div className="recap-competitor-urls">{(sourcesByComp.get(c.id) ?? []).join("\n")}</div>
          </div>
        ))}
      </div>
      <div className="recap-section">
        <div className="recap-label">Attributes</div>
        <div className="pills">{data.attributes.map((a) => <span key={a.id} className="pill">{a.label}</span>)}</div>
      </div>
      <div className="recap-section">
        <div className="recap-label">Research depth</div>
        <div className="recap-box" style={{ fontWeight: 400 }}>Seed URLs + 1 level deep (automatic)</div>
      </div>
      <button className="btn-primary" onClick={onView}>View results →</button>
    </div></div>
  );
}

/* ---------- Results ---------- */
function Results({
  data, onOpenRefine, onOpenAddAttr, onOpenSources,
}: {
  data: ProjectData;
  onOpenRefine: (competitorId: string, attributeId: string) => void;
  onOpenAddAttr: () => void;
  onOpenSources: () => void;
}) {
  const totalSources = data.sources.length;
  const gridCols = `148px repeat(${data.competitors.length || 1}, minmax(150px, 1fr))`;
  const valueMap = new Map<string, { v: string; c: Confidence }>();
  data.extractedValues.forEach((ev) => valueMap.set(ev.attribute_id + "|" + ev.competitor_id, { v: ev.value, c: ev.confidence }));

  return (
    <div className="results">
      <div className="results-toolbar">
        <div className="filters">
          <span className="filter-pill">GTM: All ▾</span>
          <span className="filter-pill">Stage: All ▾</span>
        </div>
        <div className="toolbar-actions">
          <span className="btn-toolbar">⬇ Export CSV</span>
          <span className="btn-toolbar">⧉ Copy summary</span>
          <button className="btn-toolbar" onClick={onOpenSources}>🔗 Sources<span className="count-badge">{totalSources}</span></button>
          <button className="btn-add-attr" onClick={onOpenAddAttr}>+ Add attribute</button>
        </div>
      </div>

      <div className="matrix-wrap">
        <div className="matrix" style={{ gridTemplateColumns: gridCols }}>
          <div className="mh-attr">Attribute</div>
          {data.competitors.map((c) => {
            const srcs = data.sources.filter((s) => s.competitor_id === c.id);
            const seed = srcs.filter((s) => s.source_type === "seed").length;
            const crawled = srcs.filter((s) => s.source_type === "crawled" || s.source_type === "web_search").length;
            const added = srcs.filter((s) => s.source_type === "added_manually").length;
            const parts: string[] = [];
            if (seed) parts.push(`${seed} seed`);
            if (crawled) parts.push(`${crawled} crawled`);
            if (added) parts.push(`${added} added`);
            return (
              <div key={c.id} className="mh-company">
                <div className="mh-company-name">{c.name}</div>
                <div className="mh-sources">{parts.join(" · ")}</div>
              </div>
            );
          })}

          {data.attributes.map((a) => (
            <Row key={a.id} attrId={a.id} label={a.label} competitors={data.competitors} valueMap={valueMap} onOpenRefine={onOpenRefine} />
          ))}

          <div className="m-addrow" onClick={onOpenAddAttr}>+ Add an attribute to compare</div>
        </div>
      </div>

      <div className="legend">
        <span className="legend-label">Confidence</span>
        <span className="legend-item"><span className="chip" style={{ background: "#e7efdd", color: "#4a6b32" }}>HIGH</span>well-sourced</span>
        <span className="legend-item"><span className="chip" style={{ background: "#fce9c8", color: "#9a6516" }}>MED</span>worth a glance</span>
        <span className="legend-item"><span className="chip" style={{ background: "#f8ded4", color: "#a8432a" }}>LOW</span>verify directly</span>
        <span className="legend-hint">Click any value to see its sources or refine it</span>
      </div>
    </div>
  );
}

function Row({
  attrId, label, competitors, valueMap, onOpenRefine,
}: {
  attrId: string; label: string;
  competitors: ProjectData["competitors"];
  valueMap: Map<string, { v: string; c: Confidence }>;
  onOpenRefine: (competitorId: string, attributeId: string) => void;
}) {
  return (
    <>
      <div className="m-rowlabel">{label}</div>
      {competitors.map((co) => {
        const cell = valueMap.get(attrId + "|" + co.id) ?? { v: "—", c: null as Confidence | null };
        const cc = cell.c ? CONF[cell.c] : null;
        return (
          <div key={co.id} className="m-cell">
            <span className="m-cell-inner" onClick={() => onOpenRefine(co.id, attrId)}>
              {cell.v}
              {cc && <span className="chip" style={{ background: cc.bg, color: cc.color, marginLeft: 6 }}>{cc.label}</span>}
            </span>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Refine Drawer ---------- */
function RefineDrawer({
  data, target, editValue, setEditValue, newSource, setNewSource, busy, onClose, onSave, onAddSource, onReextract,
}: {
  data: ProjectData;
  target: { competitorId: string; attributeId: string };
  editValue: string; setEditValue: (s: string) => void;
  newSource: string; setNewSource: (s: string) => void;
  busy: boolean;
  onClose: () => void; onSave: () => void; onAddSource: () => void; onReextract: () => void;
}) {
  const comp = data.competitors.find((c) => c.id === target.competitorId);
  const attr = data.attributes.find((a) => a.id === target.attributeId);
  const ev = data.extractedValues.find((e) => e.attribute_id === target.attributeId && e.competitor_id === target.competitorId);
  const cc = ev?.confidence ? CONF[ev.confidence] : null;
  const srcs = data.sources.filter((s) => s.competitor_id === target.competitorId);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div className="drawer-title">Fix this attribute</div><button className="drawer-close" onClick={onClose}>×</button></div>
        <div className="drawer-sub">{comp?.name} · {attr?.label}</div>
        <div className="value-box">
          <div className="value-box-label">Current value</div>
          <div className="value-box-val">{ev?.value ?? "—"}{cc && <span className="chip" style={{ background: cc.bg, color: cc.color }}>{cc.label}</span>}</div>
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4f4434", marginBottom: 8 }}>Overwrite this value</label>
        <textarea style={{ minHeight: 56, marginBottom: 10 }} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
        <button className="btn-block" style={{ background: "var(--accent)", color: "#2a2218" }} onClick={onSave}>Save value</button>
        <div className="or-divider"><div className="or-line" /><span className="or-text">or</span><div className="or-line" /></div>
        <div className="value-box-label" style={{ marginBottom: 8 }}>Sources used</div>
        {srcs.map((s) => {
          const m = SOURCE_BADGE[s.source_type];
          return (
            <div key={s.id} className="source-row">
              <span>↗ {s.url}</span>
              <span className="source-badge" style={{ background: m.bg, color: m.color }}>{m.label}</span>
            </div>
          );
        })}
        <div className="add-source-row">
          <input type="text" value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="Add another source URL" />
          <button className="btn-soft" onClick={onAddSource}>+ Add</button>
        </div>
        <button className="btn-block ghost" onClick={onReextract}>{busy ? "Re-extracting…" : "Re-extract with these sources"}</button>
      </div>
    </div>
  );
}

/* ---------- Sources Panel ---------- */
function SourcesPanel({
  data, draft, setDraft, onAdd, onClose,
}: {
  data: ProjectData;
  draft: Record<string, string>;
  setDraft: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  onAdd: (competitorId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div className="drawer-title">Sources</div><button className="drawer-close" onClick={onClose}>×</button></div>
        <div className="drawer-sub">Every page used across this research — what you gave it, and what it found on its own. Add more and re-extract to refresh the matrix.</div>
        {data.competitors.map((c) => {
          const srcs = data.sources.filter((s) => s.competitor_id === c.id);
          return (
            <div key={c.id} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 9 }}>{c.name}</div>
              {srcs.map((s) => {
                const m = SOURCE_BADGE[s.source_type];
                return (
                  <div key={s.id} className="source-row">
                    <span>↗ {s.url}</span>
                    <span className="source-badge" style={{ background: m.bg, color: m.color }}>{m.label}</span>
                  </div>
                );
              })}
              <div className="add-source-row" style={{ marginTop: 10 }}>
                <input
                  type="text"
                  value={draft[c.id] ?? ""}
                  onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, [c.id]: v })); }}
                  placeholder={`Add a URL for ${c.name}`}
                />
                <button className="btn-soft" onClick={() => onAdd(c.id)}>+ Add</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Add Attribute Modal ---------- */
function AddAttrModal({
  data, name, setName, targets, toggle, onClose, onExtract,
}: {
  data: ProjectData;
  name: string; setName: (s: string) => void;
  targets: Record<string, boolean>;
  toggle: (id: string) => void;
  onClose: () => void; onExtract: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div className="drawer-title">Add a dimension</div><button className="drawer-close" onClick={onClose}>×</button></div>
        <div className="drawer-sub">Extract a new attribute across some or all competitors</div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4f4434", marginBottom: 8 }}>New attribute</label>
        <input type="text" style={{ marginBottom: 18 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mobile permission support" />
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4f4434", marginBottom: 10 }}>Apply to</label>
        <div style={{ marginBottom: 20 }}>
          {data.competitors.map((c) => {
            const on = !!targets[c.id];
            return (
              <label key={c.id} className="checkbox-row" onClick={() => toggle(c.id)}>
                <span className={"checkbox" + (on ? " checked" : "")}>{on ? "✓" : ""}</span>
                {c.name}
              </label>
            );
          })}
        </div>
        <button className="btn-block" style={{ background: "var(--accent)", color: "#2a2218" }} onClick={onExtract}>Extract this attribute</button>
      </div>
    </div>
  );
}
