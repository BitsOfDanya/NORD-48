import { useQuery } from "@tanstack/react-query";

import { getRun } from "@/lib/api/simulations";

export function useSimulationRun(runId: string | null) {
  return useQuery({
    queryKey: ["simulation-run", runId],
    queryFn: () => getRun(runId as string),
    enabled: !!runId,
  });
}
