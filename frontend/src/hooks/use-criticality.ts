import { useMutation } from "@tanstack/react-query";

import { runCriticality } from "@/lib/api/resilience";
import { useAppStore } from "@/store/app-store";
import type { CriticalityRequest } from "@/types/resilience";

export function useCriticality() {
  const setCriticality = useAppStore((state) => state.setCriticality);
  const setResilienceResult = useAppStore((state) => state.setResilienceResult);
  return useMutation({
    mutationFn: (request: CriticalityRequest) => runCriticality(request),
    onSuccess: (result) => {
      setCriticality(result.ranking);
      setResilienceResult("criticality", result);
    },
  });
}
