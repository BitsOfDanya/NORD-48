import { useMutation } from "@tanstack/react-query";

import { runMonteCarlo } from "@/lib/api/resilience";
import { useAppStore } from "@/store/app-store";
import type { MonteCarloRequest } from "@/types/resilience";

export function useMonteCarlo() {
  const setResilienceResult = useAppStore((state) => state.setResilienceResult);
  return useMutation({
    mutationFn: (request: MonteCarloRequest) => runMonteCarlo(request),
    onSuccess: (result) => setResilienceResult("monteCarlo", result),
  });
}
