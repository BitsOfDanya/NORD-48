"use client";

import { GlobeView } from "@/components/constellation/globe-view";
import { Header } from "@/components/layout/header";
import { MetricsPanel } from "@/components/metrics/metrics-panel";
import { RoutePanel } from "@/components/network/route-panel";
import { ScenarioPanel } from "@/components/simulation/scenario-panel";
import { Separator } from "@/components/ui/separator";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { useSimulationRun } from "@/hooks/use-simulation-run";
import { useSnapshot } from "@/hooks/use-snapshot";
import { useTimeline } from "@/hooks/use-timeline";
import { useAppStore } from "@/store/app-store";

export default function Home() {
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const selectedTimeS = useAppStore((s) => s.selectedTimeS);

  const { data: run } = useSimulationRun(selectedRunId);
  const { data: snapshot } = useSnapshot(selectedRunId, selectedTimeS);
  const { data: timeline } = useTimeline(selectedRunId);

  const selectedRoute = selectedClientId ? snapshot?.routes[selectedClientId] : undefined;
  const clientSteps = selectedClientId ? timeline?.[selectedClientId] : undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-border bg-sidebar">
          <ScenarioPanel />
        </aside>

        <main className="min-h-[500px] flex-1 overflow-hidden">
          <GlobeView
            snapshot={snapshot}
            selectedClientId={selectedClientId}
            stepS={run?.step_s ?? 120}
            nSteps={run?.n_steps ?? 720}
          />
        </main>

        <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-border bg-sidebar">
          <MetricsPanel metrics={run?.metrics} />
          <Separator />
          <RoutePanel route={selectedRoute} />
        </aside>
      </div>

      <TimelinePanel
        steps={clientSteps}
        horizonS={run?.horizon_s ?? 86400}
        stepS={run?.step_s ?? 120}
      />
    </div>
  );
}
