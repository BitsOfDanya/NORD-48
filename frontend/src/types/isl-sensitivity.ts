import type { RoutingStrategy } from "@/types/simulation";

export interface IslSweepPointResult {
  isl_range_km: number;
  worst_availability_percent: number;
  mean_availability_percent: number;
  target_feasible: boolean;
  clients: Record<string, { availability_percent: number; max_outage_s: number; target_achieved: boolean }>;
}

export interface IslSensitivityResult {
  scenario_id: string | null;
  scenario_title: string | null;
  routing_strategy: RoutingStrategy;
  target_availability: number;
  coarse_points: IslSweepPointResult[];
  refined_points: IslSweepPointResult[];
  minimum_isl_range_km: number | null;
  minimum_isl_found: boolean;
}

export interface IslSensitivityRequest {
  scenario_id?: string;
  scenario?: unknown;
  routing_strategy: RoutingStrategy;
  isl_values_km: number[];
  refine: boolean;
  refine_step_km: number;
}
