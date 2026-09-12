import { apiFetch } from "@/lib/api/client";
import type { EstimateRequest, EstimateResult } from "@/types/economics";

export function estimateCost(request: EstimateRequest): Promise<EstimateResult> {
  return apiFetch<EstimateResult>("/api/v1/economics/estimate", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
