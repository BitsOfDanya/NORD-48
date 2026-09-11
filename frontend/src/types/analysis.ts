import type { Scenario } from "@/types/scenario";

export interface ComparisonVariant {
  run_id: string;
  scenario_id: string | null;
  scenario_title: string | null;
  changed_parameters: { path: string; before: unknown; after: unknown }[];
  metrics: Record<
    string,
    {
      availability_percent: number;
      max_outage_s: number;
      average_hops: number | null;
      route_change_count: number;
      target_achieved: boolean;
    }
  >;
  deltas_from_baseline: Record<
    string,
    { availability_percent: number; max_outage_s: number }
  >;
}

export interface ComparisonResult {
  baseline_run_id: string;
  step_s: number;
  horizon_s: number;
  variants: ComparisonVariant[];
}

export interface OptimizationCandidate {
  angles: number[];
  objectives: {
    target_shortfall: number;
    worst_availability_percent: number;
    mean_availability_percent: number;
    worst_max_outage_s: number;
  };
  score: number;
  scenario_metrics: {
    scenario_id: string;
    clients: Record<
      string,
      { availability_percent: number; max_outage_s: number; target_achieved: boolean }
    >;
  }[];
}

export interface OptimizationResult {
  method: string;
  evaluated_candidates: number;
  optimization_scenario_ids: string[];
  baseline: OptimizationCandidate;
  recommended: OptimizationCandidate;
  recommended_scenario: Scenario;
  pareto_front: OptimizationCandidate[];
}
