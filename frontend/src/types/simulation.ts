import type { GroundSite } from "@/types/scenario";

export type RoutingStrategy =
  | "minimum_hops"
  | "minimum_distance"
  | "maximum_margin"
  | "maximum_persistence";

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

export interface OutageExplanation {
  visible_satellite_count: number;
  min_elevation_deg: number;
  nearest_below_threshold_satellite_id: string | null;
  nearest_below_threshold_elevation_deg: number | null;
  gateway_contact: boolean;
  gateway_in_outage: boolean;
  network_component_count: number;
  client_component_size: number | null;
  gateway_component_size: number | null;
  same_component_as_gateway: boolean | null;
}

export interface RouteRecord {
  t_s: number;
  client_id: string;
  gateway_id: string | null;
  strategy: RoutingStrategy;
  path: string[];
  hops: number;
  total_distance_km: number | null;
  bottleneck_margin: number | null;
  bottleneck_edge: [string, string] | null;
  route_lifetime_steps: number | null;
  route_lifetime_s: number | null;
  route_valid_until_s: number | null;
  persistence_horizon_s: number | null;
  visible: boolean;
  available: boolean;
  diagnostic_reason: DiagnosticReason | null;
  diagnostic_checks: DiagnosticChecks | null;
  explanation?: OutageExplanation;
  backup_path?: string[] | null;
}

export interface OutageQuality {
  total_outage_s: number;
  mean_outage_s: number;
  median_outage_s: number;
  p95_outage_s: number;
}

export interface BottleneckBreakdown {
  percentages: Record<string, number>;
  counts: Record<string, number>;
}

export interface WindowStats {
  window_count: number;
  mean_window_s: number;
  median_window_s: number;
  p95_window_s: number;
  longest_window_s: number;
}

export interface WindowQuality {
  contact_window: WindowStats;
  service_window: WindowStats;
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
  outage_quality: OutageQuality;
  bottleneck_breakdown: BottleneckBreakdown;
  window_quality: WindowQuality;
}

export interface CoverageFootprint {
  half_angle_deg: number;
  ground_radius_km: number;
  area_km2: number;
}

export interface PhysicsSummary {
  altitude_km: number;
  orbital_period_s: number;
  revolutions_per_day: number;
  coverage_footprint: CoverageFootprint;
  geometric_propagation_delay_s: { mean: number | null; p95: number | null; max: number | null };
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
  physics: PhysicsSummary;
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
