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

      <div className="relative flex-1 overflow-y-auto bg-workspace lg:ml-60 lg:overflow-hidden">
        <div className="grid min-h-full grid-cols-1 gap-4 p-3 sm:p-4 lg:h-full lg:grid-cols-[250px_minmax(0,1fr)_300px]">
          <aside className="dashboard-panel overflow-y-auto rounded-xl p-4">
            <ScenarioPanel />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <div className="dashboard-panel min-h-[480px] flex-1 overflow-hidden rounded-xl lg:min-h-0">
              <GlobeView
                run={run}
                snapshot={snapshot}
                scenarioTitle={scenarioTitle}
                onRun={handleRun}
                isRunPending={runSimulation.isPending}
              />
            </div>
            <div className="dashboard-panel min-h-[84px] shrink-0 rounded-xl">
              <Timeline steps={clientSteps} horizonS={run?.horizon_s ?? 86400} stepS={run?.step_s ?? 120} />
            </div>
          </div>

          <aside className="dashboard-panel overflow-y-auto rounded-xl p-4">
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
