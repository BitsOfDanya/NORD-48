import { useMutation } from "@tanstack/react-query";

import { runRoutingAnalysis } from "@/lib/api/resilience";
import { useAppStore } from "@/store/app-store";
import type { RoutingAnalysisRequest } from "@/types/resilience";

export function useRoutingAnalysis() {
  const setResilienceResult = useAppStore((state) => state.setResilienceResult);
  return useMutation({
    mutationFn: (request: RoutingAnalysisRequest) => runRoutingAnalysis(request),
    onSuccess: (result) => setResilienceResult("routing", result),
  });
}
