/** One client's ground-station id and satellite ids that make up ONE found
 * minimum vertex cut — not "all critical satellites" (several minimum cuts
 * can exist; see docs/connectivity-margin.md). */
export interface ConnectivityMarginResult {
  client_id: string;
  t_s: number;
  vertex_connectivity: number;
  critical_satellites: string[];
}

export interface ConnectivityMarginRequest {
  scenario_id?: string;
  scenario?: unknown;
  run_id?: string;
  client_id: string;
  t_s: number;
}

export interface DailyCriticalSatellite {
  satellite_id: string;
  critical_samples: number;
  critical_fraction: number;
}

export interface DailyConnectivityDay {
  day_start_s: number;
  day_end_s: number;
  samples_evaluated: number;
  minimum_vertex_connectivity: number;
  mean_vertex_connectivity: number;
  average_when_connected: number | null;
  no_route_pct: number;
  margin_1_pct: number;
  margin_2_pct: number;
  margin_3_plus_pct: number;
  critical_satellites: DailyCriticalSatellite[];
}

export interface DailyConnectivityResult {
  client_id: string;
  step_s: number;
  days: DailyConnectivityDay[];
}

export interface DailyConnectivityRequest {
  scenario_id?: string;
  scenario?: unknown;
  run_id?: string;
  client_id: string;
}
