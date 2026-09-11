import { useMutation } from "@tanstack/react-query";

import { runMonteCarlo } from "@/lib/api/resilience";
import type { MonteCarloRequest } from "@/types/resilience";

export function useMonteCarlo() {
  return useMutation({
    mutationFn: (request: MonteCarloRequest) => runMonteCarlo(request),
  });
}
