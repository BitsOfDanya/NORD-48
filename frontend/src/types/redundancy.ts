import type { RoutingStrategy } from "@/types/simulation";

export interface ClientRedundancyStats {
  client_id: string;
  no_route_percent: number;
  single_path_percent: number;
  backup_path_percent: number;
  steps_evaluated: number;
}

export interface RedundancyResult {
  scenario_id: string | null;
  scenario_title: string | null;
  routing_strategy: RoutingStrategy;
  step_s: number;
  horizon_s: number;
  n_steps: number;
  clients: Record<string, ClientRedundancyStats>;
}

export interface RedundancyRequest {
  scenario_id?: string;
  scenario?: unknown;
  routing_strategy: RoutingStrategy;
}
