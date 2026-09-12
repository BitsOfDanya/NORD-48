import { apiFetch } from "@/lib/api/client";
import type { Scenario } from "@/types/scenario";
import type {
  ClientMetrics,
  RouteRecord,
  RoutingStrategy,
  SimulationRunSummary,
  SnapshotView,
  Timeline,
} from "@/types/simulation";

export function runSimulation(params: {
  scenarioId?: string;
  scenario?: Scenario;
  routingStrategy: RoutingStrategy;
}): Promise<SimulationRunSummary> {
  return apiFetch<SimulationRunSummary>("/api/v1/simulations/run", {
    method: "POST",
    body: JSON.stringify({
      scenario_id: params.scenarioId,
      scenario: params.scenario,
      routing_strategy: params.routingStrategy,
    }),
  });
}

export function getRun(runId: string): Promise<SimulationRunSummary> {
  return apiFetch<SimulationRunSummary>(`/api/v1/simulations/${runId}`);
}

export function validateRuns(runIds: string[]): Promise<{ existing: string[]; missing: string[] }> {
  return apiFetch<{ existing: string[]; missing: string[] }>("/api/v1/simulations/validate", {
    method: "POST",
    body: JSON.stringify({ run_ids: runIds }),
  });
}

export function getMetrics(runId: string): Promise<Record<string, ClientMetrics>> {
  return apiFetch<Record<string, ClientMetrics>>(`/api/v1/simulations/${runId}/metrics`);
}

export function getSnapshot(runId: string, tS: number): Promise<SnapshotView> {
  return apiFetch<SnapshotView>(`/api/v1/simulations/${runId}/snapshot?t_s=${tS}`);
}

export function getRoute(runId: string, clientId: string, tS: number): Promise<RouteRecord> {
  return apiFetch<RouteRecord>(
    `/api/v1/simulations/${runId}/route?client_id=${encodeURIComponent(clientId)}&t_s=${tS}`
  );
}

export function getTimeline(runId: string): Promise<Timeline> {
  return apiFetch<Timeline>(`/api/v1/simulations/${runId}/timeline`);
}

export function getExportUrl(runId: string): string {
  return `/api/v1/simulations/${runId}/export`;
}
