import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Aperture } from "lucide-react";

export function Shell({ children, crumb }: { children: ReactNode; crumb?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Aperture className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold tracking-tight">
              SpecLens
              {crumb && (
                <span className="ml-2 text-muted-foreground font-normal">
                  / {crumb}
                </span>
              )}
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link to="/" className="px-3 py-1.5 rounded-md hover:text-foreground hover:bg-surface transition-colors">New run</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
