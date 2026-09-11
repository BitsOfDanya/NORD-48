import type { Scenario } from "@/types/scenario";
import type { RoutingStrategy } from "@/types/simulation";

export interface EvaluatedClient {
  client_id: string;
  availability: number;
  availability_percent: number;
  max_outage_s: number;
  route_change_count: number;
  mean_hops: number | null;
  target_reached: boolean;
}

export interface EvaluatedConfiguration {
  evaluation?: number;
  parameters: Record<string, number>;
  scenarios: { profile: string; scenario_id: string; isl_range_km: number; failure_count: number; clients: EvaluatedClient[]; worst_availability: number; target_violations: number }[];
  aggregates: {
    worst_availability: number;
    mean_availability: number;
    worst_max_outage_s: number;
    mean_max_outage_s: number;
    route_churn: number;
    target_violations: number;
    conditions: number;
    target_feasible: boolean;
    parameter_deviation_deg: number;
  };
}

export interface OptimizationRequest {
  scenario_id: string;
  mode: "normal" | "robust" | "constrained_robust";
  stress_profile_ids: string[];
  variable_parameters: string[];
  bounds: Record<string, { minimum: number; maximum: number }>;
  routing_strategy: RoutingStrategy;
  budget: number;
  seed: number;
  algorithm: "random" | "differential_evolution";
  initial_exploration_size: number;
  stop_on_target: boolean;
  polish: boolean;
}

export interface OptimizationJob {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  evaluated: number;
  budget: number;
  best_worst_availability: number | null;
  target_feasible?: boolean;
  error?: string;
}

export interface OptimizationResult {
  mode: "normal" | "robust" | "constrained_robust";
  baseline: EvaluatedConfiguration;
  best: EvaluatedConfiguration;
  top_candidates: EvaluatedConfiguration[];
  pareto_front: EvaluatedConfiguration[];
  dataset: EvaluatedConfiguration[];
  convergence: { evaluation: number; best_worst_availability: number }[];
  evaluated: number;
  runtime_s: number;
  revalidated_candidates: number;
  cache: { hits: number; misses: number; exact_evaluations: number; evaluations_requested: number };
  derived_scenario: Scenario;
  recommendation: string;
}
