import type { RoutingStrategy } from "@/types/simulation";

export interface ClientStrategyStats {
  client_id: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  p05: number;
  p50: number;
  p95: number;
  target_success_fraction: number;
  mean_max_outage_s: number;
  p95_max_outage_s: number;
}

export interface StrategySummary {
  strategy: RoutingStrategy;
  per_client: ClientStrategyStats[];
  mean_worst_client_availability: number;
  p05_worst_client_availability: number;
  all_clients_target_fraction: number;
}

export interface TrialDetail {
  trial_index: number;
  failed_satellites: string[];
  worst_client_id: string;
  worst_client_availability: number;
  diagnostic_breakdown: Record<string, number>;
}

export interface MonteCarloParameters {
  failed_satellites_count: number;
  requested_failed_satellites_count: number;
  iterations: number;
  seed: number;
  candidate_satellite_count: number;
}

export interface MonteCarloResult {
  scenario_id: string | null;
  scenario_title: string | null;
  parameters: MonteCarloParameters;
  step_s: number;
  horizon_s: number;
  n_steps: number;
  target_availability: number;
  client_ids: string[];
  gateway_ids: string[];
  strategies: StrategySummary[];
  recommended_strategy: RoutingStrategy;
  recommended_reason: string;
  worst_trial: TrialDetail | null;
  best_trial: TrialDetail | null;
}

export interface MonteCarloRequest {
  scenario_id?: string;
  scenario?: unknown;
  failed_satellites_count: number;
  iterations: number;
  seed: number;
  strategies: RoutingStrategy[];
  clients?: string[];
}
