import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/speclens/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Check, Loader2, X, Plus, ArrowRight, Globe, Search, FileText, Sparkles } from "lucide-react";
import { useSpecLens, makeMockResults, seedDemoRun, type Attribute } from "@/lib/speclens-store";

export const Route = createFileRoute("/research/$runId")({
  head: ({ params }) => ({
    meta: [
      { title: `Researching · ${params.runId} — SpecLens` },
      { name: "description", content: "SpecLens is crawling competitor docs and suggesting attributes to extract." },
    ],
  }),
  component: ResearchPage,
});

const STEPS = [
  { icon: Globe, label: "Reading seed URLs" },
  { icon: FileText, label: "Discovering related pages" },
  { icon: Search, label: "Web search for missing sources" },
  { icon: Sparkles, label: "Suggesting attributes" },
];

const SUGGESTED = [
  "Roles model", "Custom roles", "Granularity", "Inheritance", "Audit log",
  "SCIM / SSO", "Guest access", "Approval workflows",
];

function ResearchPage() {
  const navigate = useNavigate();
  const { run, setRun, updateAttributes, setResults } = useSpecLens();
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);

  // Hydrate with demo if user deep-links
  useEffect(() => {
    if (!run) setRun(seedDemoRun());
  }, [run, setRun]);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => {
      setStepIdx((i) => {
        if (i >= STEPS.length - 1) {
          clearInterval(t);
          setTimeout(() => {
            // seed suggested attributes (merging with user-provided)
            const existing = useSpecLens.getState().run?.attributes ?? [];
            const existingNames = new Set(existing.map((a) => a.name));
            const merged: Attribute[] = [
              ...existing.map((a) => ({ ...a, approved: true })),
              ...SUGGESTED.filter((n) => !existingNames.has(n)).map((n, i) => ({
                id: `sg-${i}`, name: n, approved: true,
              })),
            ];
            updateAttributes(merged);
            setDone(true);
          }, 600);
          return i;
        }
        return i + 1;
      });
    }, 900);
    return () => clearInterval(t);
  }, [done, updateAttributes]);

  function runExtraction() {
    const r = useSpecLens.getState().run;
    if (!r) return;
    const approved = r.attributes.filter((a) => a.approved);
    const finalRun = { ...r, attributes: approved };
    setRun(finalRun);
    setResults(makeMockResults(finalRun));
    navigate({ to: "/results/$runId", params: { runId: r.id } });
  }

  return (
    <Shell crumb={run?.featureArea ?? "Research"}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <Loader2 className={`h-3 w-3 ${done ? "" : "animate-spin"} text-primary`} />
            Step 2 of 4 · {done ? "Review attributes" : "Researching"}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {done ? "Approve what to extract" : `Crawling ${run?.competitors.length ?? 0} competitors…`}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {done
              ? "Edit, remove, or add attributes. These become the columns in your comparison table."
              : "This usually takes 30–60 seconds. SpecLens will then suggest attributes for you to approve."}
          </p>
        </div>

        <Card className="bg-surface border-border p-6">
          <ol className="space-y-3">
            {STEPS.map((S, i) => {
              const state = i < stepIdx ? "done" : i === stepIdx && !done ? "active" : i <= stepIdx && done ? "done" : "pending";
              return (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full border ${
                      state === "done"
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : state === "active"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {state === "done" ? <Check className="h-4 w-4" /> : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <S.icon className="h-4 w-4" />}
                  </span>
                  <span className={state === "pending" ? "text-muted-foreground" : "text-foreground"}>{S.label}</span>
                </li>
              );
            })}
          </ol>
        </Card>

        {done && run && <AttributeApproval />}

        {done && (
          <div className="mt-6 flex justify-end">
            <Button size="lg" onClick={runExtraction} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Run extraction <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!done && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Mind wandering? <Link to="/" className="underline">Edit setup</Link>
          </p>
        )}
      </div>
    </Shell>
  );
}

function AttributeApproval() {
  const run = useSpecLens((s) => s.run)!;
  const updateAttributes = useSpecLens((s) => s.updateAttributes);
  const [draft, setDraft] = useState("");

  function toggle(id: string) {
    updateAttributes(run.attributes.map((a) => (a.id === id ? { ...a, approved: !a.approved } : a)));
  }
  function remove(id: string) {
    updateAttributes(run.attributes.filter((a) => a.id !== id));
  }
  function add() {
    const v = draft.trim();
    if (!v) return;
    updateAttributes([...run.attributes, { id: `u-${Date.now()}`, name: v, approved: true }]);
    setDraft("");
  }

  return (
    <Card className="bg-surface border-border p-6 mt-4">
      <div className="text-sm text-muted-foreground mb-3">
        {run.attributes.filter((a) => a.approved).length} of {run.attributes.length} selected
      </div>
      <ul className="divide-y divide-border">
        {run.attributes.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-2.5">
            <button
              onClick={() => toggle(a.id)}
              className={`grid h-5 w-5 place-items-center rounded border ${
                a.approved ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background"
              }`}
            >
              {a.approved && <Check className="h-3 w-3" />}
            </button>
            <span className={`flex-1 text-sm ${a.approved ? "text-foreground" : "text-muted-foreground line-through"}`}>
              {a.name}
            </span>
            <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Add another attribute…"
          className="bg-background border-border"
        />
        <Button variant="outline" onClick={add} className="border-border">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </Card>
  );
}
