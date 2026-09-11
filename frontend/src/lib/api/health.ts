import { apiFetch } from "@/lib/api/client";

export interface HealthResponse {
  status: string;
  service: string;
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/v1/health");
}
