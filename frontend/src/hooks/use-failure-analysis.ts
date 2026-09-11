import { useMutation } from "@tanstack/react-query";

import { runFailureAnalysis } from "@/lib/api/resilience";
import { useAppStore } from "@/store/app-store";
import type { FailureAnalysisRequest } from "@/types/resilience";

export function useFailureAnalysis() {
  const setResilienceResult = useAppStore((state) => state.setResilienceResult);
  return useMutation({
    mutationFn: (request: FailureAnalysisRequest) => runFailureAnalysis(request),
    onSuccess: (result) => setResilienceResult("failure", result),
  });
}
