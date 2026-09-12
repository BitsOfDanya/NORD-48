import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import { compareRuns } from "@/lib/api/comparison";
import { useAppStore } from "@/store/app-store";
import type { CompareRunsRequest } from "@/types/comparison";

export function useCompare() {
  const setCompareState = useAppStore((state) => state.setCompareState);
  const discardStaleRun = useAppStore((state) => state.discardStaleRun);
  const mutation = useMutation({
    mutationFn: (request: CompareRunsRequest) => compareRuns(request),
    onSuccess: (result) => setCompareState({ result }),
  });

  useEffect(() => {
    if (!(mutation.error instanceof ApiError) || mutation.error.status !== 404) return;
    const staleRunId = mutation.error.message.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    )?.[0];
    if (!staleRunId) return;
    discardStaleRun(staleRunId);
    mutation.reset();
  }, [discardStaleRun, mutation]);

  return mutation;
}
