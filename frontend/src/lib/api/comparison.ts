import { apiFetch } from "@/lib/api/client";
import type {
  CompareRunsRequest,
  ComparisonResult,
  RecoveryComparisonRequest,
  RecoveryComparisonResult,
} from "@/types/comparison";

export function compareRuns(request: CompareRunsRequest): Promise<ComparisonResult> {
  return apiFetch<ComparisonResult>("/api/v1/comparisons", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function compareRecovery(request: RecoveryComparisonRequest): Promise<RecoveryComparisonResult> {
  return apiFetch<RecoveryComparisonResult>("/api/v1/comparisons/recovery", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
