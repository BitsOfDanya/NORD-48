import type { GroundSite } from "@/types/scenario";

export type RoutingStrategy = "minimum_hops" | "minimum_distance";

export type DiagnosticReason =
  | "NO_VISIBLE_SATELLITE"
  | "NO_GATEWAY_CONTACT"
  | "GATEWAY_OUTAGE"
  | "ISL_NETWORK_SPLIT";

export interface DiagnosticChecks {
  visible_satellite: boolean;
  gateway_contact: boolean;
  isl_connectivity: boolean;
}

export interface RouteRecord {
  t_s: number;
  client_id: string;
  gateway_id: string | null;
  path: string[];
  hops: number;
  total_distance_km: number | null;
  visible: boolean;
  available: boolean;
  diagnostic_reason: DiagnosticReason | null;
  diagnostic_checks: DiagnosticChecks | null;
}

export interface ClientMetrics {
  client_id: string;
  visibility_fraction: number;
  visibility_percent: number;
  availability_fraction: number;
  availability_percent: number;
  target_availability: number;
  target_achieved: boolean;
  max_outage_s: number;
  outage_count: number;
  average_hops: number | null;
  route_change_count: number;
  average_route_distance_km: number | null;
}

export interface SimulationRunSummary {
  run_id: string;
  scenario_id: string | null;
  scenario_title: string | null;
  routing_strategy: RoutingStrategy;
  step_s: number;
  horizon_s: number;
  n_steps: number;
  client_ids: string[];
  gateway_ids: string[];
  created_at: string;
  metrics: Record<string, ClientMetrics>;
}

export interface SatelliteView {
  id: string;
  active: boolean;
  x_km: number;
  y_km: number;
  z_km: number;
  lat_deg: number;
  lon_deg: number;
  altitude_km: number;
}

export interface EdgeView {
  a: string;
  b: string;
  distance_km: number;
  kind: "isl" | "ground_contact";
}

export interface SnapshotView {
  t_s: number;
  satellites: SatelliteView[];
  edges: EdgeView[];
  ground_sites: GroundSite[];
  routes: Record<string, RouteRecord>;
}

export interface TimelineStep {
  t_s: number;
  visible: boolean;
  available: boolean;
  route_hops: number | null;
  diagnostic_reason: DiagnosticReason | null;
}

export type Timeline = Record<string, TimelineStep[]>;
