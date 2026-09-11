import { useQuery } from "@tanstack/react-query";

import { getSnapshot } from "@/lib/api/simulations";

export function useSnapshot(runId: string | null, tS: number) {
  return useQuery({
    queryKey: ["simulation-snapshot", runId, tS],
    queryFn: () => getSnapshot(runId as string, tS),
    enabled: !!runId,
    placeholderData: (previous) => previous,
  });
}
