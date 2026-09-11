import { apiFetch } from "@/lib/api/client";
import type { DeploymentPlanJob, DeploymentPlanRequest, DeploymentPlanResult } from "@/types/deployment";

export function startDeploymentPlan(request: DeploymentPlanRequest): Promise<DeploymentPlanJob> {
  return apiFetch<DeploymentPlanJob>("/api/v1/optimization/deployment-plan/run", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getDeploymentPlanStatus(runId: string): Promise<DeploymentPlanJob> {
  return apiFetch<DeploymentPlanJob>(
    `/api/v1/optimization/deployment-plan/${encodeURIComponent(runId)}`
  );
}

export function getDeploymentPlanResult(runId: string): Promise<DeploymentPlanResult> {
  return apiFetch<DeploymentPlanResult>(
    `/api/v1/optimization/deployment-plan/${encodeURIComponent(runId)}/result`
  );
}
