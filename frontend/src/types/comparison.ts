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
