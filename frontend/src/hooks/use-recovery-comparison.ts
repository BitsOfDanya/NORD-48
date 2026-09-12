import { useQuery } from "@tanstack/react-query";

import { compareRecovery } from "@/lib/api/comparison";

/** Baseline-vs-candidate recovered/lost connectivity, computed on demand
 * from two already-completed runs (see /api/v1/comparisons/recovery) — no
 * new simulation engine, just a diff over existing timelines. */
export function useRecoveryComparison(baselineRunId: string | null, candidateRunId: string | null) {
  return useQuery({
    queryKey: ["recovery-comparison", baselineRunId, candidateRunId],
    queryFn: () =>
      compareRecovery({ baseline_run_id: baselineRunId as string, candidate_run_id: candidateRunId as string }),
    enabled: !!baselineRunId && !!candidateRunId && baselineRunId !== candidateRunId,
  });
}
