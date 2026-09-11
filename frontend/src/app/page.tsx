"use client";

import { GlobeView } from "@/components/constellation/globe-view";
import { Header } from "@/components/layout/header";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { ClientMetricsPanel } from "@/components/metrics/client-metrics";
import { RoutePanel } from "@/components/network/route-panel";
import { CalculationInspector } from "@/components/simulation/calculation-inspector";
import { ScenarioPanel } from "@/components/simulation/scenario-panel";
import { SimulationSummary } from "@/components/simulation/simulation-summary";
import { Separator } from "@/components/ui/separator";
import { Timeline } from "@/components/timeline/timeline";
import { useRunSimulation } from "@/hooks/use-run-simulation";
import { useSimulationRun } from "@/hooks/use-simulation-run";
import { useSnapshot } from "@/hooks/use-snapshot";
import { useTimeline } from "@/hooks/use-timeline";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";

export default function Home() {
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const selectedTimeS = useAppStore((s) => s.selectedTimeS);
  const selectedScenarioId = useAppStore((s) => s.selectedScenarioId);
  const uploadedScenario = useAppStore((s) => s.uploadedScenario);
  const routingStrategy = useAppStore((s) => s.routingStrategy);

  const runSimulation = useRunSimulation();
  const { data: run } = useSimulationRun(selectedRunId);
  const { data: snapshot } = useSnapshot(selectedRunId, selectedTimeS);
  const { data: timeline } = useTimeline(selectedRunId);

  const selectedRoute = selectedClientId ? snapshot?.routes[selectedClientId] : undefined;
  const clientSteps = selectedClientId ? timeline?.[selectedClientId] : undefined;
  const selectedMetrics = selectedClientId ? run?.metrics[selectedClientId] : undefined;

  const handleRun = () => {
    if (uploadedScenario) {
      runSimulation.mutate({ scenario: uploadedScenario, routingStrategy });
    } else {
      runSimulation.mutate({ scenarioId: selectedScenarioId, routingStrategy });
    }
  };

  const scenarioTitle = uploadedScenario
    ? uploadedScenario.meta.id
    : scenarioDisplayTitle(selectedScenarioId, selectedScenarioId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header
        runId={selectedRunId}
        onRun={handleRun}
        isRunPending={runSimulation.isPending}
        runError={runSimulation.error}
      />
      <WorkspaceNav />

      <div className="relative flex-1 overflow-hidden bg-workspace">
        <div className="grid h-full grid-cols-[260px_1fr_320px] gap-3 p-3">
          <aside className="overflow-y-auto rounded-xl border border-border bg-card/70 p-4 backdrop-blur-sm">
            <ScenarioPanel />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <div className="min-h-0 flex-1 rounded-xl border border-border bg-card/40">
              <GlobeView
                run={run}
                snapshot={snapshot}
                scenarioTitle={scenarioTitle}
                onRun={handleRun}
                isRunPending={runSimulation.isPending}
              />
            </div>
            <div className="h-[84px] shrink-0 rounded-xl border border-border bg-card/70 backdrop-blur-sm">
              <Timeline steps={clientSteps} horizonS={run?.horizon_s ?? 86400} stepS={run?.step_s ?? 120} />
            </div>
          </div>

          <aside className="overflow-y-auto rounded-xl border border-border bg-card/70 p-4 backdrop-blur-sm">
            <ClientMetricsPanel metrics={run?.metrics} />
            <Separator className="my-3" />
            <RoutePanel route={selectedRoute} />
          </aside>
        </div>
      </div>

      <CalculationInspector run={run} snapshot={snapshot} metrics={selectedMetrics} />
      <SimulationSummary metrics={run?.metrics} />
    </div>
  );
}
