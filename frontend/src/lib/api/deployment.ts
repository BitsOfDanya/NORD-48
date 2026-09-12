import { apiFetch } from "@/lib/api/client";
import type {
  DeploymentPlanJob,
  DeploymentPlanRequest,
  DeploymentPlanResult,
  ThresholdVerificationJob,
  ThresholdVerificationRequest,
  ThresholdVerificationResult,
} from "@/types/deployment";

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

export function startThresholdVerification(
  request: ThresholdVerificationRequest
): Promise<ThresholdVerificationJob> {
  return apiFetch<ThresholdVerificationJob>("/api/v1/optimization/threshold-verification/run", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getThresholdVerificationStatus(runId: string): Promise<ThresholdVerificationJob> {
  return apiFetch<ThresholdVerificationJob>(
    `/api/v1/optimization/threshold-verification/${encodeURIComponent(runId)}`
  );
}

export function getThresholdVerificationResult(
  runId: string
): Promise<ThresholdVerificationResult> {
  return apiFetch<ThresholdVerificationResult>(
    `/api/v1/optimization/threshold-verification/${encodeURIComponent(runId)}/result`
  );
}
