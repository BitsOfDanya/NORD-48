import { useMutation } from "@tanstack/react-query";

import { runRedundancyAnalysis } from "@/lib/api/resilience";
import { useAppStore } from "@/store/app-store";

export function useRedundancy() {
  const setResilienceResult = useAppStore((state) => state.setResilienceResult);
  return useMutation({
    mutationFn: runRedundancyAnalysis,
    onSuccess: (result) => setResilienceResult("redundancy", result),
  });
}
