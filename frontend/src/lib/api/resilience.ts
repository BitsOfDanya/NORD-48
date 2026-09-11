import { apiFetch } from "@/lib/api/client";
import type { MonteCarloRequest, MonteCarloResult } from "@/types/resilience";

export function runMonteCarlo(request: MonteCarloRequest): Promise<MonteCarloResult> {
  return apiFetch<MonteCarloResult>("/api/v1/resilience/monte-carlo", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
