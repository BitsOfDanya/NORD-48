import { apiFetch } from "@/lib/api/client";
import type {
  MonteCarloRequest,
  MonteCarloResult,
  CriticalityRequest,
  CriticalityResult,
  FailureAnalysisRequest,
  FailureAnalysisResult,
  RoutingAnalysisRequest,
  RoutingAnalysisResult,
} from "@/types/resilience";

export function runMonteCarlo(request: MonteCarloRequest): Promise<MonteCarloResult> {
  return apiFetch<MonteCarloResult>("/api/v1/resilience/monte-carlo", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function runFailureAnalysis(
  request: FailureAnalysisRequest
): Promise<FailureAnalysisResult> {
  return apiFetch<FailureAnalysisResult>("/api/v1/resilience/failure-analysis", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function runCriticality(request: CriticalityRequest): Promise<CriticalityResult> {
  return apiFetch<CriticalityResult>("/api/v1/resilience/criticality/n1", {
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
