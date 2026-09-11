import { useMutation } from "@tanstack/react-query";

import { runFailureAnalysis } from "@/lib/api/resilience";
import type { FailureAnalysisRequest } from "@/types/resilience";

export function useFailureAnalysis() {
  return useMutation({ mutationFn: (request: FailureAnalysisRequest) => runFailureAnalysis(request) });
}
