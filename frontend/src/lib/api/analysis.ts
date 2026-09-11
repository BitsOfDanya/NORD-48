import { apiFetch } from "@/lib/api/client";
import type { ComparisonResult, OptimizationResult } from "@/types/analysis";
import type { Scenario } from "@/types/scenario";
import type { RoutingStrategy } from "@/types/simulation";

export function compareRuns(runIds: string[]): Promise<ComparisonResult> {
  return apiFetch<ComparisonResult>("/api/v1/comparisons", {
    method: "POST",
    body: JSON.stringify({ run_ids: runIds }),
  });
}

export function optimizeScenario(params: {
  scenarioId?: string;
  scenario?: Scenario;
  robustnessScenarioIds?: string[];
  routingStrategy: RoutingStrategy;
}): Promise<OptimizationResult> {
  return apiFetch<OptimizationResult>("/api/v1/optimization/run", {
    method: "POST",
    body: JSON.stringify({
      scenario_id: params.scenarioId,
      scenario: params.scenario,
      robustness_scenario_ids: params.robustnessScenarioIds ?? [],
      routing_strategy: params.routingStrategy,
      maxiter: 1,
      popsize: 3,
      seed: 48,
      pareto_limit: 8,
    }),
  });
}
