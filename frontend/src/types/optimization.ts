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
  failure_robust?: {
    cvar_alpha: number;
    cvar_availability: number;
    worst_availability: number;
    mean_case_worst_availability: number;
    normal_worst_availability: number;
    normal_target_feasible: boolean;
    failure_start_s: number;
    failure_end_s: number;
    bank_size: number;
    case_scores: Record<string, number>;
  };
}

export interface OptimizationRequest {
  scenario_id: string;
  mode: "normal" | "robust" | "constrained_robust" | "failure_cvar";
  stress_profile_ids: string[];
  variable_parameters: string[];
  bounds: Record<string, { minimum: number; maximum: number }>;
  routing_strategy: RoutingStrategy;
  budget: number;
  seed: number;
  algorithm: "random" | "differential_evolution" | "toroidal_differential_evolution";
  initial_exploration_size: number;
  stop_on_target: boolean;
  polish: boolean;
  fixed_failure_profile_id: string;
  failure_count: number;
  failure_random_samples: number;
  failure_correlated_samples: number;
  cvar_alpha: number;
  adversarial_rounds: number;
  adversarial_search_budget: number;
  adversarial_cases_per_round: number;
  adversarial_min_distance: number;
  outer_restarts: number;
  holdout_random_samples: number;
  holdout_correlated_samples: number;
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
  mode: "normal" | "robust" | "constrained_robust" | "failure_cvar";
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
  failure_bank?: { case_id: string; satellite_ids: string[]; kind: string }[];
  failure_start_s?: number;
  failure_end_s?: number;
  cvar_alpha?: number;
  optimization_rounds?: {
    round: number;
    bank_size: number;
    evaluated: number;
    best_cvar_availability: number;
    best_worst_availability: number;
  }[];
  holdout_validation?: {
    seed: number;
    bank_size: number;
    generalization_gap: number;
    baseline: { cvar_availability: number; worst_availability: number };
    best: { cvar_availability: number; worst_availability: number };
  } | null;
}
