import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/speclens/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, X, ArrowRight, Sparkles } from "lucide-react";
import { useSpecLens, seedDemoRun, type CrawlDepth } from "@/lib/speclens-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SpecLens — competitive research for product managers" },
      { name: "description", content: "Turn messy competitor docs into a structured, attribute-tagged comparison table before you write your spec." },
      { property: "og:title", content: "SpecLens — competitive research for PMs" },
      { property: "og:description", content: "Crawl, extract, and compare competitor features side by side." },
    ],
  }),
  component: SetupPage,
});

const DEPTHS: { id: CrawlDepth; title: string; sub: string }[] = [
  { id: "shallow", title: "Shallow", sub: "Seed pages only" },
  { id: "standard", title: "Standard", sub: "Seed + 1 hop, ~15 pages each" },
  { id: "deep", title: "Deep", sub: "Full section, ~40 pages each" },
];

function SetupPage() {
  const navigate = useNavigate();
  const setRun = useSpecLens((s) => s.setRun);
  const demo = seedDemoRun();

  const [featureArea, setFeatureArea] = useState(demo.featureArea);
  const [competitors, setCompetitors] = useState(demo.competitors);
  const [attrs, setAttrs] = useState<string[]>(["Roles model", "Custom roles"]);
  const [draft, setDraft] = useState("");
  const [depth, setDepth] = useState<CrawlDepth>("standard");

  const canAdd = competitors.length < 6;
  const canStart = featureArea.trim() && competitors.length >= 2 && competitors.every((c) => c.name.trim() && c.seedUrl.trim());

  function addCompetitor() {
    if (!canAdd) return;
    setCompetitors([...competitors, { id: crypto.randomUUID(), name: "", seedUrl: "" }]);
  }
  function updateC(id: string, patch: Partial<typeof competitors[number]>) {
    setCompetitors(competitors.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeC(id: string) {
    if (competitors.length <= 2) return;
    setCompetitors(competitors.filter((c) => c.id !== id));
  }
  function addAttr() {
    const v = draft.trim();
    if (!v || attrs.includes(v)) return;
    setAttrs([...attrs, v]);
    setDraft("");
  }

  function start() {
    const id = crypto.randomUUID().slice(0, 8);
    setRun({
      id,
      featureArea: featureArea.trim(),
      competitors,
      depth,
      attributes: attrs.map((name, i) => ({ id: `a${i}-${name}`, name, approved: false })),
    });
    navigate({ to: "/research/$runId", params: { runId: id } });
  }

  return (
    <Shell crumb="New run">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Step 1 of 4 · Setup
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">What are we researching?</h1>
          <p className="mt-2 text-muted-foreground">
            Name a feature area, drop in a few competitors, and SpecLens will crawl their docs and turn it into a comparison table.
          </p>
        </div>

        <Card className="bg-surface border-border p-6 space-y-8">
          <div className="space-y-2">
            <Label htmlFor="feature">Feature area</Label>
            <Input
              id="feature"
              placeholder="e.g. Permissions, Onboarding, Notifications"
              value={featureArea}
              onChange={(e) => setFeatureArea(e.target.value)}
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <Label>Competitors</Label>
                <p className="text-xs text-muted-foreground mt-1">2 to 6. Paste a seed URL — we'll discover related pages.</p>
              </div>
              <span className="text-xs text-muted-foreground">{competitors.length} / 6</span>
            </div>
            <div className="space-y-2">
              {competitors.map((c) => (
                <div key={c.id} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <Input
                    placeholder="Name"
                    value={c.name}
                    onChange={(e) => updateC(c.id, { name: e.target.value })}
                    className="bg-background border-border"
                  />
                  <Input
                    placeholder="https://docs.example.com/feature"
                    value={c.seedUrl}
                    onChange={(e) => updateC(c.id, { seedUrl: e.target.value })}
                    className="bg-background border-border font-mono text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeC(c.id)}
                    disabled={competitors.length <= 2}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addCompetitor} disabled={!canAdd} className="border-border">
              <Plus className="h-4 w-4" /> Add competitor
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Attributes to extract</Label>
              <p className="text-xs text-muted-foreground mt-1">Optional. The AI will suggest more after crawling.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {attrs.map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5 rounded-full bg-background border border-border px-3 py-1 text-sm">
                  {a}
                  <button onClick={() => setAttrs(attrs.filter((x) => x !== a))} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <div className="flex gap-1">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAttr())}
                  placeholder="Add attribute…"
                  className="h-8 w-44 bg-background border-border"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Crawl depth</Label>
            <div className="grid grid-cols-3 gap-2">
              {DEPTHS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDepth(d.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    depth === d.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{d.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="mt-6 flex justify-end">
          <Button size="lg" disabled={!canStart} onClick={start} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Start research <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Shell>
  );
}
