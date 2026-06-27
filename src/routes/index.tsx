import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import "@/styles/speclens.css";
import {
  addAttributeWithValues,
  addCompetitorWithSources,
  addSource,
  createProject,
  getExtractedValue,
  listProjects,
  loadProjectData,
  relinkCellSources,
  saveCellValue,
  saveCompetitorsAndSeeds,
  saveConfirmedAttributes,
  type Confidence,
  type ProjectData,
  type ProjectSummary,
  type SourceType,
} from "@/lib/speclens/api";
import { runStage1, runStage2 } from "@/lib/speclens/research.functions";


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
type AttrChip = { label: string; description: string | null; is_custom: boolean };

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
  const stage1Fn = useServerFn(runStage1);
  const stage2Fn = useServerFn(runStage2);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("setup");
  const [data, setData] = useState<ProjectData | null>(null);

  // wizard ephemeral state
  const [step, setStep] = useState(0);
  const [featureArea, setFeatureArea] = useState("");
  const [featureDescription, setFeatureDescription] = useState("");
  const [wizCompetitors, setWizCompetitors] = useState<{ name: string; urls: string }[]>([{ name: "", urls: "" }]);
  const [attrs, setAttrs] = useState<AttrChip[]>([]);
  const [newAttr, setNewAttr] = useState("");

  // ai state
  const [stageBusy, setStageBusy] = useState<null | "stage1" | "stage2">(null);
  const [stageError, setStageError] = useState<string | null>(null);

  // drawer state
  const [refineTarget, setRefineTarget] = useState<{ competitorId: string; attributeId: string } | null>(null);
  const [refineEditValue, setRefineEditValue] = useState("");
  const [refineNewSource, setRefineNewSource] = useState("");
  const [refineBusy, setRefineBusy] = useState(false);

  const [showAddAttr, setShowAddAttr] = useState(false);
  const [addAttrName, setAddAttrName] = useState("");
  const [addAttrTargets, setAddAttrTargets] = useState<Record<string, boolean>>({});

  const [showAddCompetitor, setShowAddCompetitor] = useState(false);
  const [addCompName, setAddCompName] = useState("");
  const [addCompUrls, setAddCompUrls] = useState("");

  const [showSources, setShowSources] = useState(false);

  const [sourceDraft, setSourceDraft] = useState<Record<string, string>>({});

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

  const lastLoadedIdRef = useRef<string | null>(null);
  async function refreshData(id: string | null) {
    if (!id) { setData(null); return; }
    const d = await loadProjectData(id);
    setData(d);
    const isProjectSwitch = lastLoadedIdRef.current !== id;
    lastLoadedIdRef.current = id;
    if (d) {
      if (d.project.status === "ready") setTab((t) => (t === "researching" ? "results" : t));
      if (d.project.status === "draft" && isProjectSwitch) {
        setStep(0);
        setFeatureArea(d.project.name === "Untitled project" ? "" : d.project.name);
        setFeatureDescription(d.project.feature_description ?? "");
        setWizCompetitors([{ name: "", urls: "" }]);
        setAttrs([]);
        setStageError(null);
      }
    }
  }
  useEffect(() => {
    refreshData(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const activeProject = useMemo(() => projects.find((p) => p.id === activeId) ?? null, [projects, activeId]);

  useEffect(() => {
    if (!activeProject) return;
    if (activeProject.status === "ready") setTab("results");
    else if (activeProject.status === "running") setTab("researching");
    else setTab("setup");
  }, [activeProject?.id, activeProject?.status]);

  function canProceed() {
    if (step === 0) return !!featureArea.trim();
    if (step === 1) return wizCompetitors.some((c) => c.name.trim() && c.urls.trim());
    if (step === 2) return attrs.length > 0;
    return true;
  }

  async function handleNew() {
    const p = await createProject();
    setStep(0); setFeatureArea(""); setFeatureDescription("");
    setWizCompetitors([{ name: "", urls: "" }]); setAttrs([]); setNewAttr("");
    setStageError(null);
    setTab("setup");
    await refreshProjects(p.id);
  }

  // Step 1 → 2: persist competitors+seeds, run Stage 1, populate attribute chips.
  async function handleAfterCompetitors() {
    if (!activeId) return;
    setStageError(null);
    setStageBusy("stage1");
    try {
      await saveCompetitorsAndSeeds(activeId, featureArea.trim() || "Untitled project", featureDescription.trim(), wizCompetitors);
      const res = await stage1Fn({ data: { projectId: activeId } });
      const suggested = (res.suggestions ?? []).map((s) => ({
        label: s.label,
        description: s.description ?? null,
        is_custom: false,
      }));
      setAttrs(suggested);
      setStep(2);
      // Note: intentionally NOT calling refreshData here — it would see
      // status="draft" and reset the wizard back to step 0, wiping inputs.
      await refreshProjects(activeId);
    } catch (e) {
      setStageError(e instanceof Error ? e.message : String(e));
    } finally {
      setStageBusy(null);
    }
  }

  // Step 2 → research: persist attrs, run Stage 2, show results.
  async function handleStartResearch() {
    if (!activeId) return;
    setStageError(null);
    setStageBusy("stage2");
    setTab("researching");
    try {
      await saveConfirmedAttributes(activeId, attrs);
      await stage2Fn({ data: { projectId: activeId } });
      await refreshProjects(activeId);
      await refreshData(activeId);
      setTab("results");
    } catch (e) {
      setStageError(e instanceof Error ? e.message : String(e));
    } finally {
      setStageBusy(null);
    }
  }

  async function retryStage2() {
    if (!activeId) return;
    setStageError(null);
    setStageBusy("stage2");
    try {
      await stage2Fn({ data: { projectId: activeId } });
      await refreshProjects(activeId);
      await refreshData(activeId);
      setTab("results");
    } catch (e) {
      setStageError(e instanceof Error ? e.message : String(e));
    } finally {
      setStageBusy(null);
    }
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
  function openAddCompetitor() {
    setAddCompName(""); setAddCompUrls(""); setShowAddCompetitor(true);
  }
  async function extractCompetitor() {
    if (!activeId) return;
    const name = addCompName.trim();
    if (!name) return;
    const created = await addCompetitorWithSources(activeId, name, addCompUrls);
    setShowAddCompetitor(false);
    await refreshProjects(activeId);
    await refreshData(activeId);
    try {
      await runStage2({ data: { projectId: activeId, competitorIds: [created.id] } });
    } catch (e) {
      console.error("extractCompetitor failed", e);
    }
    await refreshData(activeId);
  }


  async function addPanelSource(competitorId: string) {
    const url = (sourceDraft[competitorId] ?? "").trim();
    if (!url) return;
    await addSource(competitorId, url, "added_manually");
    setSourceDraft((d) => ({ ...d, [competitorId]: "" }));
    await refreshData(activeId);
  }

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
              <div className={"tab" + (tab === "setup" || tab === "researching" ? " active" : "")} onClick={() => setTab("setup")}>⚙ Setup</div>
              <div
                className={"tab" + (showResults ? " active" : "")}
                style={{ cursor: status === "ready" ? "pointer" : "default" }}
                onClick={() => status === "ready" && setTab("results")}
              >
                ▦ Results
                {status === "ready" && data && (<span className="tab-count">{data.competitors.length}</span>)}
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
                attrs={attrs}
                setAttrs={setAttrs}
                newAttr={newAttr}
                setNewAttr={setNewAttr}
                canProceed={canProceed()}
                stageBusy={stageBusy}
                stageError={stageError}
                onNext={() => {
                  if (!canProceed()) return;
                  if (step === 0) setStep(1);
                  else if (step === 1) handleAfterCompetitors();
                  else handleStartResearch();
                }}
              />
            )}

            {activeProject && showResearching && (
              <Researching
                project={activeProject}
                busy={stageBusy === "stage2"}
                error={stageError}
                onRetry={retryStage2}
              />
            )}

            {activeProject && showRecap && data && <Recap data={data} onView={() => setTab("results")} />}

            {activeProject && showResults && data && (
              <Results data={data} onOpenRefine={openRefine} onOpenAddAttr={openAddAttr} onOpenAddCompetitor={openAddCompetitor} onOpenSources={() => setShowSources(true)} />
            )}

          </div>
        </div>
      </div>

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
      {showAddCompetitor && (
        <AddCompetitorModal
          name={addCompName}
          setName={setAddCompName}
          urls={addCompUrls}
          setUrls={setAddCompUrls}
          onClose={() => setShowAddCompetitor(false)}
          onExtract={extractCompetitor}
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
  attrs: AttrChip[]; setAttrs: (a: AttrChip[]) => void;
  newAttr: string; setNewAttr: (s: string) => void;
  canProceed: boolean;
  stageBusy: null | "stage1" | "stage2";
  stageError: string | null;
  onNext: () => void;
}) {
  const { step, setStep, featureArea, setFeatureArea, featureDescription, setFeatureDescription,
    competitors, setCompetitors, attrs, setAttrs, newAttr, setNewAttr, canProceed, stageBusy, stageError, onNext } = props;

  const titles = ["What feature are you researching?", "Who are you comparing?", "Attributes to extract"];
  const subs = [
    "This tells the AI what to look for across every source it reads. You can rename it later.",
    "Add competitors and a few seed URLs each — the AI will crawl further from there.",
    "These were suggested by AI from your seed sources. Remove any that don't apply, or add your own.",
  ];

  function addCompetitor() { if (competitors.length < 6) setCompetitors([...competitors, { name: "", urls: "" }]); }
  function removeCompetitor(i: number) { setCompetitors(competitors.filter((_, idx) => idx !== i)); }
  function updateCompetitor(i: number, patch: Partial<{ name: string; urls: string }>) {
    setCompetitors(competitors.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function removeAttr(label: string) { setAttrs(attrs.filter((a) => a.label !== label)); }
  function addAttr() {
    const v = newAttr.trim();
    if (v && !attrs.some((a) => a.label.toLowerCase() === v.toLowerCase())) {
      setAttrs([...attrs, { label: v, description: null, is_custom: true }]);
      setNewAttr("");
    }
  }

  const busy = stageBusy !== null;
  const cta = step < 2 ? "Continue →" : "Start research →";
  const ctaBusy = step === 1 && stageBusy === "stage1" ? "Suggesting attributes…" : busy ? "Working…" : cta;

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
            <span>✦</span><span>Suggested by AI based on your seed sources. Hover a chip for what it means.</span>
          </div>
          {attrs.length === 0 && <div className="hint">No attributes yet — add at least one to continue.</div>}
          <div className="pills">
            {attrs.map((a) => (
              <span key={a.label} className="pill" title={a.description ?? "Custom attribute"}>
                {a.label}<span className="x" onClick={() => removeAttr(a.label)}>×</span>
              </span>
            ))}
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

      {stageError && (
        <div className="note" style={{ marginTop: 16, background: "#fbe5dc", color: "#8a3018", border: "1px solid #f0c6b7" }}>
          <span>⚠</span><span>{stageError}</span>
        </div>
      )}

      <div className="footer-nav">
        {step > 0 ? <button className="btn-back" onClick={() => setStep(step - 1)} disabled={busy}>← Back</button> : <span />}
        <button
          className="btn-next"
          disabled={!canProceed || busy}
          style={{
            background: canProceed && !busy ? "var(--accent)" : "#ece0c8",
            color: canProceed && !busy ? "#2a2218" : "#bcae97",
            cursor: canProceed && !busy ? "pointer" : "not-allowed",
          }}
          onClick={onNext}
        >
          {ctaBusy}
        </button>
      </div>
    </div></div>
  );
}

/* ---------- Researching ---------- */
function Researching({ project, busy, error, onRetry }: { project: ProjectSummary; busy: boolean; error: string | null; onRetry: () => void }) {
  return (
    <div className="screen"><div className="screen-inner">
      <div className="research-title">Researching {project.name}…</div>
      <div className="research-sub">{project.competitor_count} competitors · this usually takes 1–3 minutes</div>
      <div>
        <div className="research-item">
          <span className="research-icon" style={{ background: busy ? "transparent" : "var(--accent)", border: busy ? "2px solid var(--accent)" : "none" }}>{busy ? "" : "✓"}</span>
          <span className="research-label" style={{ fontWeight: 600 }}>
            {busy ? "Calling the model — reading seed pages, searching the web, extracting attributes…" : error ? "Stopped" : "Done"}
          </span>
        </div>
      </div>
      {error && (
        <>
          <div className="note" style={{ marginTop: 22, background: "#fbe5dc", color: "#8a3018", border: "1px solid #f0c6b7" }}>
            <span>⚠</span><span>{error}</span>
          </div>
          <button className="btn-primary" style={{ marginTop: 18 }} onClick={onRetry}>Retry extraction</button>
        </>
      )}
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
  data, onOpenRefine, onOpenAddAttr, onOpenAddCompetitor, onOpenSources,
}: {
  data: ProjectData;
  onOpenRefine: (competitorId: string, attributeId: string) => void;
  onOpenAddAttr: () => void;
  onOpenAddCompetitor: () => void;
  onOpenSources: () => void;
}) {
  const totalSources = data.sources.length;
  const gridCols = `148px repeat(${data.competitors.length || 1}, minmax(150px, 1fr)) 170px`;
  const valueMap = new Map<string, { id: string; v: string; c: Confidence }>();
  data.extractedValues.forEach((ev) =>
    valueMap.set(ev.attribute_id + "|" + ev.competitor_id, { id: ev.id, v: ev.value, c: ev.confidence }),
  );
  const sourceById = new Map(data.sources.map((s) => [s.id, s]));
  const sourcesByValueId = new Map<string, string[]>();
  data.evSources.forEach((link) => {
    const arr = sourcesByValueId.get(link.extracted_value_id) ?? [];
    arr.push(link.source_id);
    sourcesByValueId.set(link.extracted_value_id, arr);
  });

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
          <button className="btn-add-attr" onClick={onOpenAddCompetitor}>+ Add competitor</button>
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
          <div className="mh-company" style={{ cursor: "pointer" }} onClick={onOpenAddCompetitor}>
            <div className="mh-company-name" style={{ color: "var(--accent)" }}>+ Add competitor</div>
            <div className="mh-sources">extend the matrix</div>
          </div>

          {data.attributes.map((a) => (
            <Row
              key={a.id}
              attrId={a.id}
              label={a.label}
              competitors={data.competitors}
              valueMap={valueMap}
              sourcesByValueId={sourcesByValueId}
              sourceById={sourceById}
              onOpenRefine={onOpenRefine}
            />
          ))}

          <div className="m-addrow" onClick={onOpenAddAttr} style={{ gridColumn: `1 / span ${data.competitors.length + 2}` }}>+ Add an attribute to compare</div>
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

function hostnameOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function Row({
  attrId, label, competitors, valueMap, sourcesByValueId, sourceById, onOpenRefine,
}: {
  attrId: string; label: string;
  competitors: ProjectData["competitors"];
  valueMap: Map<string, { id: string; v: string; c: Confidence }>;
  sourcesByValueId: Map<string, string[]>;
  sourceById: Map<string, ProjectData["sources"][number]>;
  onOpenRefine: (competitorId: string, attributeId: string) => void;
}) {
  return (
    <>
      <div className="m-rowlabel">{label}</div>
      {competitors.map((co) => {
        const cell = valueMap.get(attrId + "|" + co.id);
        const cc = cell?.c ? CONF[cell.c] : null;
        const sourceIds = cell ? (sourcesByValueId.get(cell.id) ?? []) : [];
        const sources = sourceIds.map((id) => sourceById.get(id)).filter(Boolean) as ProjectData["sources"];
        const shown = sources.slice(0, 3);
        const extra = sources.length - shown.length;
        return (
          <div key={co.id} className="m-cell">
            <span className="m-cell-inner" onClick={() => onOpenRefine(co.id, attrId)}>
              {cell?.v ?? "—"}
              {cc && <span className="chip" style={{ background: cc.bg, color: cc.color, marginLeft: 6 }}>{cc.label}</span>}
            </span>
            {shown.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {shown.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={s.url}
                    style={{
                      fontSize: 10,
                      color: "#6e6253",
                      background: "#f1ead9",
                      padding: "2px 6px",
                      borderRadius: 4,
                      textDecoration: "none",
                      maxWidth: 130,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >↗ {hostnameOf(s.url)}</a>
                ))}
                {extra > 0 && <span style={{ fontSize: 10, color: "#9a8d77", padding: "2px 4px" }}>+{extra}</span>}
              </div>
            )}
          </div>
        );
      })}
      <div className="m-cell" />
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
                <span className={"checkbox" + (on ? " on" : "")}>{on ? "✓" : ""}</span>
                <span>{c.name}</span>
              </label>
            );
          })}
        </div>
        <button className="btn-block" style={{ background: "var(--accent)", color: "#2a2218" }} onClick={onExtract}>Extract this attribute</button>
      </div>
    </div>
  );
}

/* ---------- Add Competitor Modal ---------- */
function AddCompetitorModal({
  name, setName, urls, setUrls, onClose, onExtract,
}: {
  name: string; setName: (s: string) => void;
  urls: string; setUrls: (s: string) => void;
  onClose: () => void; onExtract: () => void;
}) {
  const canExtract = !!name.trim();
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div className="drawer-title">Add a competitor</div><button className="drawer-close" onClick={onClose}>×</button></div>
        <div className="drawer-sub">Add another company to the matrix. Seed URLs help the AI extract values for your existing attributes.</div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4f4434", marginBottom: 8 }}>Company name</label>
        <input type="text" style={{ marginBottom: 18 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Linear" />
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4f4434", marginBottom: 8 }}>Seed URLs</label>
        <textarea style={{ minHeight: 80, marginBottom: 18 }} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://help.example.com/permissions" />
        <button
          className="btn-block"
          style={{ background: canExtract ? "var(--accent)" : "#ece0c8", color: canExtract ? "#2a2218" : "#bcae97", cursor: canExtract ? "pointer" : "not-allowed" }}
          disabled={!canExtract}
          onClick={onExtract}
        >Add competitor</button>
      </div>
    </div>
  );
}
