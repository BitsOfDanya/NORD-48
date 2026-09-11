import { apiFetch } from "@/lib/api/client";
import type { CompareRunsRequest, ComparisonResult } from "@/types/comparison";

export function compareRuns(request: CompareRunsRequest): Promise<ComparisonResult> {
  return apiFetch<ComparisonResult>("/api/v1/comparisons", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
