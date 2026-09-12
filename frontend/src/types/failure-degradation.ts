import type { RoutingStrategy } from "@/types/simulation";

export type DegradationMethod = "exact" | "monte_carlo";

export interface DegradationPointResult {
  k: number;
  method: DegradationMethod;
  median_worst_availability_percent: number;
  p10_worst_availability_percent: number;
  worst_observed_availability_percent: number;
  target_survival_fraction: number;
  samples: number;
}

export interface FailureDegradationResult {
  scenario_id: string | null;
  scenario_title: string | null;
  routing_strategy: RoutingStrategy;
  target_availability: number;
  iterations: number;
  seed: number;
  points: DegradationPointResult[];
}

export interface FailureDegradationJob {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  evaluated: number;
  total: number;
  current_k: number | null;
  error?: string;
}

export interface FailureDegradationRequest {
  scenario_id?: string;
  scenario?: unknown;
  routing_strategy: RoutingStrategy;
  k_values: number[];
  iterations: number;
  seed: number;
}
