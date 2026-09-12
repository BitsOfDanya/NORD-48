import { useMutation } from "@tanstack/react-query";

import { estimateCost } from "@/lib/api/economics";

export function useEconomics() {
  return useMutation({ mutationFn: estimateCost });
}
