import { useMutation } from "@tanstack/react-query";

import { runRoutingAnalysis } from "@/lib/api/resilience";
import type { RoutingAnalysisRequest } from "@/types/resilience";

export function useRoutingAnalysis() {
  return useMutation({
    mutationFn: (request: RoutingAnalysisRequest) => runRoutingAnalysis(request),
  });
}
