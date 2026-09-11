import { apiFetch } from "@/lib/api/client";
import type {
  MonteCarloRequest,
  MonteCarloResult,
  RoutingAnalysisRequest,
  RoutingAnalysisResult,
} from "@/types/resilience";

export function runMonteCarlo(request: MonteCarloRequest): Promise<MonteCarloResult> {
  return apiFetch<MonteCarloResult>("/api/v1/resilience/monte-carlo", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function runRoutingAnalysis(
  request: RoutingAnalysisRequest
): Promise<RoutingAnalysisResult> {
  return apiFetch<RoutingAnalysisResult>("/api/v1/resilience/routing-analysis", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
