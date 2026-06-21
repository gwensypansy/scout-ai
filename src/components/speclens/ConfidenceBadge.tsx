import type { Confidence } from "@/lib/speclens-store";
import { cn } from "@/lib/utils";

const STYLES: Record<Confidence, string> = {
  high: "bg-success/15 text-success border-success/30",
  medium: "bg-warning/15 text-warning border-warning/30",
  low: "bg-danger/15 text-danger border-danger/30",
};

const LABEL: Record<Confidence, string> = { high: "High", medium: "Med", low: "Low" };

export function ConfidenceBadge({ confidence, className }: { confidence: Confidence; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        STYLES[confidence],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABEL[confidence]}
    </span>
  );
}
