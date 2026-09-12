import type { Scenario } from "@/types/scenario";
import type { RoutingStrategy } from "@/types/simulation";

export interface SubsetClientResult {
  availability_percent: number;
  max_outage_s: number;
  target_achieved: boolean;
}

export interface SubsetEvaluation {
  active_satellite_ids: string[];
  size: number;
  planes: Record<string, number>;
  clients: Record<string, SubsetClientResult>;
  worst_availability: number;
  mean_availability: number;
  worst_max_outage_s: number;
  route_churn: number;
  target_feasible: boolean;
}

export interface StageRefinement {
  baseline_worst_availability: number;
  refined_worst_availability: number;
  parameters: Record<string, number>;
  target_feasible: boolean;
  derived_scenario: Scenario;
  evaluated: number;
}

export interface DeploymentStage {
  size: number;
  subset: SubsetEvaluation;
  derived_scenario: Scenario;
  greedy_subset?: SubsetEvaluation;
  local_search?: {
    method: string;
    one_swap_passes_completed: number;
    one_swap_evaluations: number;
    tabu_iterations_completed: number;
    tabu_evaluations: number;
    improvement: number;
    seed: number;
  };
  refined?: StageRefinement;
}

export interface DeploymentPlanResult {
  scenario_id: string | null;
  scenario_title: string | null;
  routing_strategy: RoutingStrategy;
  total_satellites: number;
  target_availability: number;
  method: string;
  stage_sizes_requested: number[];
  searched_up_to_size: number;
  search_capped: boolean;
  stages: DeploymentStage[];
  size_curve: SubsetEvaluation[];
  minimum_constellation_size: number | null;
  minimum_constellation_size_found: boolean;
}

export interface DeploymentPlanJob {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  evaluated: number;
  total: number;
  best_worst_availability: number | null;
  error?: string;
}

export interface DeploymentPlanRequest {
  scenario_id: string;
  routing_strategy: RoutingStrategy;
  stage_sizes: number[];
  refine_budget: number;
  refine_seed: number;
  one_swap_passes: number;
  tabu_iterations: number;
  tabu_candidates_per_iteration: number;
  tabu_tenure: number;
  local_search_seed: number;
  max_search_size?: number | null;
}

export interface MarginalGainPoint {
  size: number;
  worst_availability_percent: number;
  marginal_gain_pp: number;
}

export interface ThresholdPointResult {
  size: number;
  greedy_worst_availability_percent: number;
  refined_worst_availability_percent: number;
  target_margin_pp: number;
  swaps_applied: [string, string][];
  evaluations: number;
  target_feasible: boolean;
  active_satellite_ids: string[];
  planes: Record<string, number>;
}

export interface ThresholdVerificationResult {
  scenario_id: string | null;
  scenario_title: string | null;
  routing_strategy: RoutingStrategy;
  target_availability: number;
  method: string;
  sizes_tested: number[];
  greedy_only_minimum_size: number | null;
  first_verified_pass_size: number | null;
  points: ThresholdPointResult[];
  marginal_gain_curve: MarginalGainPoint[];
}

export interface ThresholdVerificationJob {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  phase: "greedy" | "refine" | null;
  evaluated: number;
  total: number;
  best_worst_availability?: number;
  current_size?: number;
  error?: string;
}

export interface ThresholdVerificationRequest {
  scenario_id: string;
  routing_strategy: RoutingStrategy;
  sizes: number[];
  max_passes: number;
}
