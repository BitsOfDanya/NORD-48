import { apiFetch } from "@/lib/api/client";
import type { Scenario, ScenarioExample } from "@/types/scenario";

export function listExamples(): Promise<ScenarioExample[]> {
  return apiFetch<ScenarioExample[]>("/api/v1/scenarios/examples");
}

export function getExample(scenarioId: string): Promise<Scenario> {
  return apiFetch<Scenario>(`/api/v1/scenarios/examples/${encodeURIComponent(scenarioId)}`);
}

export function uploadScenario(file: File): Promise<Scenario> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<Scenario>("/api/v1/scenarios/upload", {
    method: "POST",
    body: formData,
  });
}
