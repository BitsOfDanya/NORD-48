import { apiFetch } from "@/lib/api/client";
import type {
  FailureDegradationJob,
  FailureDegradationRequest,
  FailureDegradationResult,
} from "@/types/failure-degradation";

export function startFailureDegradation(
  request: FailureDegradationRequest
): Promise<FailureDegradationJob> {
  return apiFetch<FailureDegradationJob>("/api/v1/resilience/failure-degradation/run", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getFailureDegradationStatus(runId: string): Promise<FailureDegradationJob> {
  return apiFetch<FailureDegradationJob>(
    `/api/v1/resilience/failure-degradation/${encodeURIComponent(runId)}`
  );
}

export function getFailureDegradationResult(runId: string): Promise<FailureDegradationResult> {
  return apiFetch<FailureDegradationResult>(
    `/api/v1/resilience/failure-degradation/${encodeURIComponent(runId)}/result`
  );
}
