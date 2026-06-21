import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/speclens/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfidenceBadge } from "@/components/speclens/ConfidenceBadge";
import { useSpecLens, seedDemoRun, makeMockResults, type Confidence } from "@/lib/speclens-store";
import { Download, Copy, Search, ExternalLink, Wand2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/results/$runId")({
  head: ({ params }) => ({
    meta: [
      { title: `Results · ${params.runId} — SpecLens` },
      { name: "description", content: "Side-by-side competitor comparison with confidence indicators." },
    ],
  }),
  component: ResultsPage,
});

const FILTERS: { id: "all" | Confidence; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High confidence" },
  { id: "medium", label: "Medium+" },
  { id: "low", label: "Low only" },
];

function ResultsPage() {
  const { run, results, setRun, setResults } = useSpecLens();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | Confidence>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!run || !results) {
      const r = seedDemoRun();
      setRun(r);
      setResults(makeMockResults(r));
    }
  }, [run, results, setRun, setResults]);

  const visibleAttrs = useMemo(() => {
    if (!run) return [];
    const ql = q.toLowerCase();
    return run.attributes.filter((a) => !ql || a.name.toLowerCase().includes(ql));
  }, [run, q]);

  if (!run || !results) return null;

  function cellPasses(conf: Confidence) {
    if (filter === "all") return true;
    if (filter === "high") return conf === "high";
    if (filter === "medium") return conf !== "low";
    return conf === "low";
  }

  return (
    <Shell crumb={`${run.featureArea} · Results`}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            Step 3 of 4 · Results
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{run.featureArea}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.competitors.length} competitors · {run.attributes.length} attributes · crawled {run.depth}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-border" onClick={() => toast("Exported to CSV (mock)")}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" className="border-border" onClick={() => toast("Summary copied (mock)")}>
            <Copy className="h-4 w-4" /> Copy summary
          </Button>
          <Button onClick={() => navigate({ to: "/refine/$runId", params: { runId: run.id } })} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Wand2 className="h-4 w-4" /> Refine
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter attributes…"
            className="w-64 pl-8 bg-surface border-border"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                filter === f.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/30">
              <th className="sticky left-0 z-10 bg-background/95 px-4 py-3 text-left font-medium text-muted-foreground min-w-[180px]">
                Competitor
              </th>
              {visibleAttrs.map((a) => (
                <th key={a.id} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap min-w-[180px]">
                  {a.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run.competitors.map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-4 py-3 align-top">
                  <div className="font-medium">{c.name}</div>
                  <a href={c.seedUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5 max-w-[180px] truncate">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.seedUrl.replace(/^https?:\/\//, "")}</span>
                  </a>
                </td>
                {visibleAttrs.map((a) => {
                  const cell = results.cells[c.id]?.[a.id];
                  if (!cell) return <td key={a.id} className="px-4 py-3 text-muted-foreground">—</td>;
                  const dim = !cellPasses(cell.confidence);
                  return (
                    <td key={a.id} className={`px-4 py-3 align-top transition-opacity ${dim ? "opacity-30" : ""}`}>
                      <Link
                        to="/refine/$runId"
                        params={{ runId: run.id }}
                        search={{ attr: a.id, competitor: c.id }}
                        className="group block"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-foreground group-hover:text-primary transition-colors">{cell.value}</span>
                          <ConfidenceBadge confidence={cell.confidence} className="shrink-0 mt-0.5" />
                        </div>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Tip: click any cell to refine that attribute or re-extract it across competitors.
      </p>
    </Shell>
  );
}
