import { useMutation } from "@tanstack/react-query";

import { runCriticality } from "@/lib/api/resilience";
import { useAppStore } from "@/store/app-store";
import type { CriticalityRequest } from "@/types/resilience";

export function useCriticality() {
  const setCriticality = useAppStore((state) => state.setCriticality);
  return useMutation({
    mutationFn: (request: CriticalityRequest) => runCriticality(request),
    onSuccess: (result) => setCriticality(result.ranking),
  });
}
