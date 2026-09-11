import { useMutation } from "@tanstack/react-query";

import { runN2Threshold } from "@/lib/api/resilience";
import { useAppStore } from "@/store/app-store";

export function useN2Threshold() {
  const setResilienceResult = useAppStore((state) => state.setResilienceResult);
  return useMutation({
    mutationFn: runN2Threshold,
    onSuccess: (result) => setResilienceResult("threshold", result),
  });
}
