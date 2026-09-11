export interface ScenarioExample {
  id: string;
  title: string;
  launch_stage: number;
  altitude_km: number;
  inclination_deg: number;
  isl_range_km: number;
  min_elevation_deg: number;
  target_availability: number;
  horizon_s: number;
  step_s: number;
  failure_count: number;
  gateway_outage_count: number;
}

export interface GroundSite {
  id: string;
  name: string | null;
  role: "client" | "gateway";
  lat_deg: number;
  lon_deg: number;
}

export interface Scenario {
  schema_version: string;
  meta: { id: string; title: string | null };
  environment: {
    altitude_km: number;
    inclination_deg: number;
    earth_angle0_deg: number;
    horizon_s: number;
    step_s: number;
    min_elevation_deg: number;
    isl_range_km: number;
    target_availability: number;
  };
  design: {
    launch_stage: number;
    planes: { id: string; raan_deg: number; phase_deg: number }[];
    satellites: { id: string; plane_id: string; slot_deg: number; launch_batch: number }[];
  };
  ground_sites: GroundSite[];
  failures: { satellite_id: string; start_s: number; end_s: number }[];
  gateway_outages: { gateway_id: string; start_s: number; end_s: number }[];
}
