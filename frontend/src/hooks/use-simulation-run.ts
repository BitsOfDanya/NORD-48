import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { getRun } from "@/lib/api/simulations";
import { ApiError } from "@/lib/api/client";
import { useAppStore } from "@/store/app-store";

export function useSimulationRun(runId: string | null) {
  const discardStaleRun = useAppStore((state) => state.discardStaleRun);
  const query = useQuery({
    queryKey: ["simulation-run", runId],
    queryFn: () => getRun(runId as string),
    enabled: !!runId,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  useEffect(() => {
    if (runId && query.error instanceof ApiError && query.error.status === 404) {
      discardStaleRun(runId);
    }
  }, [discardStaleRun, query.error, runId]);

  return query;
}
