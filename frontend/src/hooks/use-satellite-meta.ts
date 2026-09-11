import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getExample } from "@/lib/api/scenarios";
import { useAppStore } from "@/store/app-store";
import type { SimulationRunSummary } from "@/types/simulation";

export interface SatelliteMeta {
  planeId: string;
  launchBatch: number;
}

/**
 * Per-satellite plane/launch-batch, read from the scenario design (not
 * returned by the snapshot endpoint, which only carries what routing/
 * metrics need). Purely presentational — used by the Satellite Inspector.
 */
export function useSatelliteMeta(run: SimulationRunSummary | undefined) {
  const uploadedScenario = useAppStore((s) => s.uploadedScenario);

  const scenarioQuery = useQuery({
    queryKey: ["scenario-detail", run?.scenario_id],
    queryFn: () => getExample(run!.scenario_id as string),
    enabled: !!run?.scenario_id && !uploadedScenario,
    staleTime: Infinity,
  });

  const scenario = uploadedScenario ?? scenarioQuery.data;

  return useMemo(() => {
    const map = new Map<string, SatelliteMeta>();
    if (scenario) {
      for (const sat of scenario.design.satellites) {
        map.set(sat.id, { planeId: sat.plane_id, launchBatch: sat.launch_batch });
      }
    }
    return map;
  }, [scenario]);
}
