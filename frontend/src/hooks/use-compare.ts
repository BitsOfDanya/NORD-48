import { useMutation } from "@tanstack/react-query";

import { compareRuns } from "@/lib/api/comparison";
import { useAppStore } from "@/store/app-store";
import type { CompareRunsRequest } from "@/types/comparison";

export function useCompare() {
  const setCompareState = useAppStore((state) => state.setCompareState);
  return useMutation({
    mutationFn: (request: CompareRunsRequest) => compareRuns(request),
    onSuccess: (result) => setCompareState({ result }),
  });
}
