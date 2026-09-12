import { apiFetch } from "@/lib/api/client";
import type { IslSensitivityRequest, IslSensitivityResult } from "@/types/isl-sensitivity";

export function runIslSensitivity(request: IslSensitivityRequest): Promise<IslSensitivityResult> {
  return apiFetch<IslSensitivityResult>("/api/v1/optimization/isl-sensitivity", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
