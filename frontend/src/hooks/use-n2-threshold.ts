import { useMutation } from "@tanstack/react-query";

import { runN2Threshold } from "@/lib/api/resilience";

export function useN2Threshold() {
  return useMutation({ mutationFn: runN2Threshold });
}
