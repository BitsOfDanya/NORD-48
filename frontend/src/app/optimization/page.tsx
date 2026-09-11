"use client";

import { AboutDialog } from "@/components/layout/about-dialog";
import { BackendStatus } from "@/components/layout/backend-status";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { OptimizerWorkspace } from "@/components/optimizer/optimizer-workspace";

export default function OptimizationPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="border-b border-border bg-background">
        <header className="flex h-16 items-center gap-4 px-4">
          <div className="flex flex-col leading-tight">
            <h1 className="text-[15px] font-semibold tracking-wide text-foreground">NORD-48</h1>
            <p className="text-[11px] text-muted-foreground">Оптимизация параметров группировки</p>
          </div>
          <AboutDialog />
          <div className="ml-auto">
            <BackendStatus />
          </div>
        </header>
      </div>
      <WorkspaceNav />
      <div className="min-h-0 flex-1 bg-workspace">
        <OptimizerWorkspace />
      </div>
    </div>
  );
}
