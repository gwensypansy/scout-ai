import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Shell } from "@/components/speclens/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/speclens/ConfidenceBadge";
import { useSpecLens, seedDemoRun, makeMockResults, type Cell, type Confidence } from "@/lib/speclens-store";
import { ArrowLeft, RefreshCw, Plus, Loader2 } from "lucide-react";

const searchSchema = z.object({
  attr: z.string().optional(),
  competitor: z.string().optional(),
});

export const Route = createFileRoute("/refine/$runId")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: `Refine · ${params.runId} — SpecLens` },
      { name: "description", content: "Fix a specific attribute or add a new dimension and re-extract." },
    ],
  }),
  component: RefinePage,
});

type Mode = "fix" | "add";

function RefinePage() {
  const { run, results, setRun, setResults, updateCell, updateAttributes } = useSpecLens();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(search.attr ? "fix" : "fix");
  const [selectedAttr, setSelectedAttr] = useState<string | undefined>(search.attr);
  const [newAttr, setNewAttr] = useState("");
  const [hint, setHint] = useState("");
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<Record<string, Cell> | null>(null);

  useEffect(() => {
    if (!run || !results) {
      const r = seedDemoRun();
      setRun(r);
      setResults(makeMockResults(r));
    }
  }, [run, results, setRun, setResults]);

  if (!run || !results) return null;

  const activeAttr = run.attributes.find((a) => a.id === selectedAttr) ?? run.attributes[0];

  function runRefine() {
    setWorking(true);
    setPreview(null);
    setTimeout(() => {
      const next: Record<string, Cell> = {};
      const confs: Confidence[] = ["high", "high", "medium", "high"];
      run!.competitors.forEach((c, i) => {
        const base = results!.cells[c.id]?.[activeAttr.id]?.value ?? "Unknown";
        next[c.id] = {
          value: hint ? `${base} (${hint})` : `${base} — confirmed`,
          confidence: confs[i % confs.length],
          source: c.seedUrl,
        };
      });
      setPreview(next);
      setWorking(false);
    }, 1200);
  }

  function applyFix() {
    if (!preview) return;
    Object.entries(preview).forEach(([cid, cell]) => updateCell(cid, activeAttr.id, cell));
    navigate({ to: "/results/$runId", params: { runId: run!.id } });
  }

  function runAdd() {
    if (!newAttr.trim()) return;
    setWorking(true);
    setTimeout(() => {
      const id = `n-${Date.now()}`;
      const attrs = [...run!.attributes, { id, name: newAttr.trim(), approved: true }];
      updateAttributes(attrs);
      const confs: Confidence[] = ["high", "medium", "high", "low"];
      const pool = ["Supported", "Not documented", "Enterprise only", "Roadmap"];
      run!.competitors.forEach((c, i) => {
        updateCell(c.id, id, { value: pool[i % pool.length], confidence: confs[i % confs.length], source: c.seedUrl });
      });
      setWorking(false);
      navigate({ to: "/results/$runId", params: { runId: run!.id } });
    }, 1200);
  }

  return (
    <Shell crumb={`${run.featureArea} · Refine`}>
      <div className="mx-auto max-w-3xl">
        <Link to="/results/$runId" params={{ runId: run.id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to results
        </Link>

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            Step 4 of 4 · Refine
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Refine your dataset</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Re-extract an attribute that looks wrong, or add a new dimension across all competitors.
          </p>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1">
          <button
            onClick={() => setMode("fix")}
            className={`rounded-md px-3 py-1.5 text-sm ${mode === "fix" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <RefreshCw className="inline h-3.5 w-3.5 mr-1.5" /> Fix attribute
          </button>
          <button
            onClick={() => setMode("add")}
            className={`rounded-md px-3 py-1.5 text-sm ${mode === "add" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Plus className="inline h-3.5 w-3.5 mr-1.5" /> Add dimension
          </button>
        </div>

        {mode === "fix" ? (
          <Card className="bg-surface border-border p-6 space-y-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Attribute</div>
              <div className="flex flex-wrap gap-2">
                {run.attributes.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedAttr(a.id); setPreview(null); }}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      a.id === activeAttr.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Hint for the model (optional)</label>
              <Input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder='e.g. "look on the pricing page" or "only count GA features"'
                className="bg-background border-border"
              />
            </div>
            <div>
              <Button onClick={runRefine} disabled={working} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {working ? <><Loader2 className="h-4 w-4 animate-spin" /> Re-extracting…</> : <><RefreshCw className="h-4 w-4" /> Re-extract across {run.competitors.length} competitors</>}
              </Button>
            </div>

            <div className="border-t border-border pt-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                {preview ? "Before → After" : "Current values"}
              </div>
              <ul className="divide-y divide-border">
                {run.competitors.map((c) => {
                  const before = results.cells[c.id]?.[activeAttr.id];
                  const after = preview?.[c.id];
                  return (
                    <li key={c.id} className="py-3 grid grid-cols-[140px_1fr_auto_1fr] items-start gap-3 text-sm">
                      <span className="font-medium">{c.name}</span>
                      <div className="flex items-start gap-2">
                        <span className={preview ? "text-muted-foreground line-through" : ""}>{before?.value ?? "—"}</span>
                        {before && <ConfidenceBadge confidence={before.confidence} />}
                      </div>
                      <span className="text-muted-foreground">{preview ? "→" : ""}</span>
                      <div className="flex items-start gap-2">
                        {after ? (
                          <>
                            <span>{after.value}</span>
                            <ConfidenceBadge confidence={after.confidence} />
                          </>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {preview && (
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" className="border-border" onClick={() => setPreview(null)}>Discard</Button>
                  <Button onClick={applyFix} className="bg-primary text-primary-foreground hover:bg-primary/90">Apply changes</Button>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card className="bg-surface border-border p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">New dimension</label>
              <Input
                value={newAttr}
                onChange={(e) => setNewAttr(e.target.value)}
                placeholder='e.g. "Approval workflows", "Guest seat pricing"'
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Extraction prompt (optional)</label>
              <Input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="What should the AI look for?"
                className="bg-background border-border"
              />
            </div>
            <Button onClick={runAdd} disabled={working || !newAttr.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {working ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</> : <><Plus className="h-4 w-4" /> Extract across competitors</>}
            </Button>
          </Card>
        )}
      </div>
    </Shell>
  );
}
