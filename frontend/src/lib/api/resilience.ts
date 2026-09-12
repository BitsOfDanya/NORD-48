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
  N2Request,
  N2Result,
} from "@/types/resilience";
import type { RedundancyRequest, RedundancyResult } from "@/types/redundancy";

export function runMonteCarlo(request: MonteCarloRequest): Promise<MonteCarloResult> {
  return apiFetch<MonteCarloResult>("/api/v1/resilience/monte-carlo", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function runN2Threshold(request: N2Request): Promise<N2Result> {
  return apiFetch<N2Result>("/api/v1/resilience/failure-threshold/n2", {
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

export function runRedundancyAnalysis(request: RedundancyRequest): Promise<RedundancyResult> {
  return apiFetch<RedundancyResult>("/api/v1/resilience/redundancy", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
