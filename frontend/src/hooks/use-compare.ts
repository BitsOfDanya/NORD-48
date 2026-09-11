import { useMutation } from "@tanstack/react-query";

import { compareRuns } from "@/lib/api/comparison";
import type { CompareRunsRequest } from "@/types/comparison";

export function useCompare() {
  return useMutation({
    mutationFn: (request: CompareRunsRequest) => compareRuns(request),
  });
}
