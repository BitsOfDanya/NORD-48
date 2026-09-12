import { useMutation } from "@tanstack/react-query";

import { getRoute } from "@/lib/api/simulations";

/** On-demand backup-path lookup for the currently selected client/time —
 * a plain extra call to the existing /route endpoint (see
 * `find_backup_path` on the backend), triggered only by the user clicking
 * "Показать резервный маршрут", never wired into snapshot polling. */
export function useBackupRoute() {
  return useMutation({
    mutationFn: ({ runId, clientId, tS }: { runId: string; clientId: string; tS: number }) =>
      getRoute(runId, clientId, tS),
  });
}
