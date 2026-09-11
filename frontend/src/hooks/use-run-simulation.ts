import { useMutation, useQueryClient } from "@tanstack/react-query";

import { runSimulation } from "@/lib/api/simulations";
import { useAppStore } from "@/store/app-store";
import type { Scenario } from "@/types/scenario";
import type { RoutingStrategy } from "@/types/simulation";

export function useRunSimulation() {
  const queryClient = useQueryClient();
  const setSelectedRunId = useAppStore((s) => s.setSelectedRunId);
  const setSelectedClientId = useAppStore((s) => s.setSelectedClientId);
  const setSelectedTimeS = useAppStore((s) => s.setSelectedTimeS);

  return useMutation({
    mutationFn: (params: {
      scenarioId?: string;
      scenario?: Scenario;
      routingStrategy: RoutingStrategy;
    }) => runSimulation(params),
    onSuccess: (run) => {
      queryClient.setQueryData(["simulation-run", run.run_id], run);
      setSelectedRunId(run.run_id);
      setSelectedTimeS(0);
      const currentClientId = useAppStore.getState().selectedClientId;
      if (!currentClientId || !run.client_ids.includes(currentClientId)) {
        setSelectedClientId(run.client_ids[0] ?? null);
      }
      useAppStore.getState().addRunHistoryEntry({
        run_id: run.run_id,
        scenario_id: run.scenario_id,
        scenario_title: run.scenario_title,
        routing_strategy: run.routing_strategy,
        created_at: run.created_at,
      });
    },
  });
}
