import type { TimelineStep } from "@/types/simulation";

export interface OutageInterval {
  client_id: string;
  start_s: number;
  end_s: number;
  duration_s: number;
  representative_t_s: number;
}

/** Groups the consecutive unavailable steps around `clickedTS` into one
 * interval. If the clicked step is available, returns null — there's
 * nothing to explain. `end_s` is exclusive (start of the next available
 * step, or horizon end). Representative timestamp is the interval midpoint
 * (deterministic, floor-rounded to an existing step). */
export function findOutageInterval(
  steps: TimelineStep[],
  clientId: string,
  clickedTS: number,
  stepS: number
): OutageInterval | null {
  const idx = steps.findIndex((s) => s.t_s === clickedTS);
  if (idx === -1 || steps[idx].available) return null;

  let start = idx;
  let end = idx;
  while (start > 0 && !steps[start - 1].available) start--;
  while (end < steps.length - 1 && !steps[end + 1].available) end++;

  const start_s = steps[start].t_s;
  const end_s = steps[end].t_s + stepS;
  const midIdx = start + Math.floor((end - start) / 2);

  return {
    client_id: clientId,
    start_s,
    end_s,
    duration_s: end_s - start_s,
    representative_t_s: steps[midIdx].t_s,
  };
}
