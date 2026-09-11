import { apiFetch } from "@/lib/api/client";
import type { OptimizationJob, OptimizationRequest, OptimizationResult } from "@/types/optimization";

export function startOptimization(request: OptimizationRequest): Promise<OptimizationJob> {
  return apiFetch<OptimizationJob>("/api/v1/optimization/run", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getOptimizationStatus(runId: string): Promise<OptimizationJob> {
  return apiFetch<OptimizationJob>(`/api/v1/optimization/${encodeURIComponent(runId)}`);
}

export function getOptimizationResult(runId: string): Promise<OptimizationResult> {
  return apiFetch<OptimizationResult>(`/api/v1/optimization/${encodeURIComponent(runId)}/result`);
}
