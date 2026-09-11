import { useQuery } from "@tanstack/react-query";

import { getTimeline } from "@/lib/api/simulations";

export function useTimeline(runId: string | null) {
  return useQuery({
    queryKey: ["simulation-timeline", runId],
    queryFn: () => getTimeline(runId as string),
    enabled: !!runId,
  });
}
