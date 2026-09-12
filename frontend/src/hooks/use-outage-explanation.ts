import { useQuery } from "@tanstack/react-query";

import { getRoute } from "@/lib/api/simulations";
import type { OutageInterval } from "@/lib/outage-intervals";

/** On-demand fetch of the outage explanation at an interval's representative
 * timestamp — triggered only when the user asks ("Почему нет связи?"), not
 * wired into snapshot/timeline polling. One extra `/route` call, not a new
 * endpoint. */
export function useOutageExplanation(
  runId: string | null,
  interval: OutageInterval | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["outage-explanation", runId, interval?.client_id, interval?.representative_t_s],
    queryFn: () => getRoute(runId as string, (interval as OutageInterval).client_id, interval!.representative_t_s),
    enabled: enabled && !!runId && !!interval,
  });
}
