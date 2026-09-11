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

export interface RoutingAnalysisRow {
  strategy: RoutingStrategy;
  client_id: string;
  mean_route_lifetime_s: number | null;
  median_route_lifetime_s: number | null;
  p05_route_lifetime_s: number | null;
  p95_route_lifetime_s: number | null;
  max_route_lifetime_s: number | null;
  mean_bottleneck_margin: number | null;
  median_bottleneck_margin: number | null;
  p05_bottleneck_margin: number | null;
  mean_hops: number | null;
  route_change_count: number;
  route_changes_per_hour: number;
  availability: number;
  max_outage_s: number;
}

export interface RoutingAnalysisResult {
  scenario_id: string | null;
  scenario_title: string | null;
  step_s: number;
  horizon_s: number;
  n_steps: number;
  lifetime_sample: "route_segments";
  strategies: RoutingStrategy[];
  rows: RoutingAnalysisRow[];
  recommended_strategy: RoutingStrategy;
  recommended_reason: string;
}

export interface RoutingAnalysisRequest {
  scenario_id: string;
}

export interface FailureClientResult {
  client_id: string;
  baseline: FailureClientMetrics;
  failed: FailureClientMetrics;
  delta: {
    availability_pp: number;
    visibility_pp: number;
    max_outage_s: number;
    route_changes: number;
    mean_hops: number | null;
  };
  diagnostics: {
    baseline_outages: Record<string, number>;
    all_failed_outages: Record<string, number>;
    failure_induced: Record<string, number>;
  };
  route_disruption: {
    failure_induced_outage_steps: number;
    changed_or_lost_route_steps: number;
  };
}

export interface FailureClientMetrics {
  availability: number;
  availability_percent: number;
  visibility: number;
  visibility_percent: number;
  max_outage_s: number;
  route_change_count: number;
  mean_hops: number | null;
  time_below_target_s: number;
  target_reached: boolean;
}

export interface FailureTimelineStep {
  t_s: number;
  baseline_available: boolean;
  failed_available: boolean;
  failure_induced: boolean;
  route_disrupted: boolean;
}

export interface FailureAnalysisResult {
  experiment: {
    scenario_id: string;
    scenario_title: string;
    satellite_ids: string[];
    failure_start_s: number;
    failure_end_s: number;
    routing_strategy: RoutingStrategy;
    step_s: number;
    horizon_s: number;
  };
  clients: FailureClientResult[];
  affected_clients: string[];
  target_violations: string[];
  diagnostic_distribution: Record<string, number>;
  timeline_impact: Record<string, FailureTimelineStep[]>;
}

export interface FailureAnalysisRequest {
  scenario_id: string;
  satellite_ids: string[];
  failure_start_s: number;
  failure_end_s: number;
  routing_strategy: RoutingStrategy;
}

export interface CriticalityRow {
  rank: number;
  satellite_id: string;
  plane_id: string;
  worst_client_availability_drop_pp: number;
  mean_availability_drop_pp: number;
  affected_clients_count: number;
  affected_clients: string[];
  target_violations_count: number;
  target_violations: string[];
  max_outage_increase_s: number;
  additional_route_changes: number;
  failure_induced_outage_steps: number;
}

export interface CriticalityResult {
  experiment: {
    scenario_id: string;
    scenario_title: string;
    analysis_start_s: number;
    analysis_end_s: number;
    routing_strategy: RoutingStrategy;
    step_s: number;
    horizon_s: number;
    satellites_analyzed: number;
    baseline_geometry_runs: number;
  };
  ranking: CriticalityRow[];
  recommendation: string;
}

export interface CriticalityRequest {
  scenario_id: string;
  analysis_start_s: number;
  analysis_end_s: number;
  routing_strategy: RoutingStrategy;
}
