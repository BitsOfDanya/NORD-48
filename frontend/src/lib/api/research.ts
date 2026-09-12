import { apiFetch } from "@/lib/api/client";

export interface CatBoostSurrogateReport {
  artifact_id: string;
  scenario_id: string;
  routing_strategy: string;
  target: string;
  features: string[];
  seed: number;
  training_samples: number;
  holdout_samples: number;
  mae: number;
  rmse: number;
  mean_baseline_mae: number;
}

export function getCatBoostReport(): Promise<CatBoostSurrogateReport> {
  return apiFetch<CatBoostSurrogateReport>("/api/v1/research/ml");
}
