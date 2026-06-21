import { create } from "zustand";

export type Confidence = "high" | "medium" | "low";
export type CrawlDepth = "shallow" | "standard" | "deep";

export interface Competitor {
  id: string;
  name: string;
  seedUrl: string;
}

export interface Attribute {
  id: string;
  name: string;
  description?: string;
  approved: boolean;
}

export interface Cell {
  value: string;
  confidence: Confidence;
  source?: string;
}

export interface RunConfig {
  id: string;
  featureArea: string;
  competitors: Competitor[];
  attributes: Attribute[];
  depth: CrawlDepth;
}

export interface RunResults {
  // [competitorId][attributeId] -> Cell
  cells: Record<string, Record<string, Cell>>;
}

interface SpecLensState {
  run: RunConfig | null;
  results: RunResults | null;
  setRun: (run: RunConfig) => void;
  updateAttributes: (attrs: Attribute[]) => void;
  setResults: (r: RunResults) => void;
  updateCell: (competitorId: string, attributeId: string, cell: Cell) => void;
}

export const useSpecLens = create<SpecLensState>((set) => ({
  run: null,
  results: null,
  setRun: (run) => set({ run }),
  updateAttributes: (attrs) =>
    set((s) => (s.run ? { run: { ...s.run, attributes: attrs } } : s)),
  setResults: (results) => set({ results }),
  updateCell: (cid, aid, cell) =>
    set((s) => {
      if (!s.results) return s;
      return {
        results: {
          cells: {
            ...s.results.cells,
            [cid]: { ...(s.results.cells[cid] ?? {}), [aid]: cell },
          },
        },
      };
    }),
}));

export function makeMockResults(run: RunConfig): RunResults {
  const valuePool: Record<string, string[]> = {
    "Roles model": ["Predefined + custom", "Predefined only", "Fully custom RBAC", "Workspace + project tiers"],
    "Custom roles": ["Yes — unlimited", "Yes — up to 10", "No", "Enterprise plan only"],
    "Granularity": ["Per-resource", "Per-workspace", "Per-project", "Field-level"],
    "Inheritance": ["Top-down", "None", "Group-based", "Folder-based"],
    "Audit log": ["Yes, 90 days", "Yes, unlimited", "Enterprise only", "No"],
    "SCIM / SSO": ["SAML + SCIM", "SAML only", "Google + Okta", "Enterprise add-on"],
  };
  const confidences: Confidence[] = ["high", "high", "medium", "high", "low", "medium"];
  const cells: RunResults["cells"] = {};
  run.competitors.forEach((c, ci) => {
    cells[c.id] = {};
    run.attributes.forEach((a, ai) => {
      const pool = valuePool[a.name] ?? ["—", "Documented", "Not specified", "Custom"];
      cells[c.id][a.id] = {
        value: pool[(ci + ai) % pool.length],
        confidence: confidences[(ci + ai) % confidences.length],
        source: `${c.seedUrl}#${a.name.toLowerCase().replace(/\s+/g, "-")}`,
      };
    });
  });
  return { cells };
}

export function seedDemoRun(): RunConfig {
  return {
    id: "demo",
    featureArea: "Permissions",
    depth: "standard",
    competitors: [
      { id: "c1", name: "Linear", seedUrl: "https://linear.app/docs/permissions" },
      { id: "c2", name: "Notion", seedUrl: "https://notion.so/help/permissions" },
      { id: "c3", name: "Figma", seedUrl: "https://help.figma.com/permissions" },
      { id: "c4", name: "Asana", seedUrl: "https://asana.com/guide/permissions" },
    ],
    attributes: [
      { id: "a1", name: "Roles model", approved: true },
      { id: "a2", name: "Custom roles", approved: true },
      { id: "a3", name: "Granularity", approved: true },
      { id: "a4", name: "Inheritance", approved: true },
      { id: "a5", name: "Audit log", approved: true },
      { id: "a6", name: "SCIM / SSO", approved: true },
    ],
  };
}
