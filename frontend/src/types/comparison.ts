export interface ComparisonClientMetric {
  availability_percent: number;
  max_outage_s: number;
  average_hops: number | null;
  route_change_count: number;
  target_achieved: boolean;
  mean_bottleneck_margin: number | null;
  p05_bottleneck_margin: number | null;
}

export interface ComparisonParameterChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface ComparisonDelta {
  availability_percent: number;
  max_outage_s: number;
}

export interface ComparisonVariant {
  run_id: string;
  scenario_id: string | null;
  scenario_title: string | null;
  is_baseline: boolean;
  changed_parameters: ComparisonParameterChange[];
  metrics: Record<string, ComparisonClientMetric>;
  worst_availability_percent: number;
  worst_availability_delta_pp: number;
  target_status: string;
  deltas_from_baseline: Record<string, ComparisonDelta>;
}

export interface ComparisonResult {
  baseline_run_id: string;
  step_s: number;
  horizon_s: number;
  variants: ComparisonVariant[];
}

export interface CompareRunsRequest {
  run_ids: string[];
  baseline_run_id?: string;
}

export interface ClientRecoveryStats {
  client_id: string;
  recovered_steps: number;
  lost_steps: number;
  net_recovered_steps: number;
  recovered_seconds: number;
  lost_seconds: number;
  net_recovered_seconds: number;
  recovered_reason_counts: Record<string, number>;
  lost_reason_counts: Record<string, number>;
}

export interface RecoveryTransitionExample {
  client_id: string;
  t_s: number;
  baseline_reason?: string | null;
  candidate_reason?: string | null;
  candidate_path?: string[];
  candidate_edges?: [string, string][];
  baseline_path?: string[];
  baseline_edges?: [string, string][];
}

export interface RecoveryComparisonResult {
  per_client: Record<string, ClientRecoveryStats>;
  summary: {
    total_recovered_seconds: number;
    total_lost_seconds: number;
    total_net_recovered_seconds: number;
  };
  dominant_recovery_reason: string | null;
  recovered_example: RecoveryTransitionExample | null;
  lost_example: RecoveryTransitionExample | null;
}

export interface RecoveryComparisonRequest {
  baseline_run_id: string;
  candidate_run_id: string;
}
