"use client";

import { ArrowRight, Loader2, Shield, ShieldOff } from "lucide-react";
import { useEffect } from "react";

import { useBackupRoute } from "@/hooks/use-backup-route";
import { useAppStore } from "@/store/app-store";

/** On-demand lookup of a node-disjoint backup path for the current
 * client/time (see backend `find_backup_path`) — reuses the existing
 * Route Redundancy node-removal test, just for one instant instead of the
 * whole horizon. Rendered on the Globe in muted amber via `backupRoutePath`
 * in the store; this panel is the trigger + textual result. */
export function BackupRoutePanel({
  runId,
  clientId,
  tS,
}: {
  runId: string;
  clientId: string;
  tS: number;
}) {
  const backupRoutePath = useAppStore((s) => s.backupRoutePath);
  const setBackupRoutePath = useAppStore((s) => s.setBackupRoutePath);
  const backupRoute = useBackupRoute();

  // A different client/time invalidates whatever backup result is showing.
  useEffect(() => {
    setBackupRoutePath(null);
    backupRoute.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tS]);

  const checked = backupRoute.isSuccess;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-2">
      {!checked && (
        <button
          type="button"
          onClick={() => {
            backupRoute.mutate(
              { runId, clientId, tS },
              { onSuccess: (data) => setBackupRoutePath(data.backup_path ?? null) }
            );
          }}
          disabled={backupRoute.isPending}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-60"
        >
          {backupRoute.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
          Показать резервный маршрут
        </button>
      )}

      {checked && backupRoutePath && backupRoutePath.length > 1 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-status-ok">
            <Shield className="h-3.5 w-3.5" /> Резервный маршрут есть
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {backupRoutePath.map((node, i) => (
              <span key={`${node}-${i}`} className="flex items-center gap-1">
                <span className="rounded border border-status-ok/40 bg-status-ok/10 px-2 py-0.5 font-mono text-xs">
                  {node}
                </span>
                {i < backupRoutePath.length - 1 && <ArrowRight className="h-3 w-3 text-text-muted" />}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Узлы резервного пути не пересекаются с основным маршрутом.
          </p>
        </div>
      )}

      {checked && (!backupRoutePath || backupRoutePath.length <= 1) && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldOff className="h-3.5 w-3.5" /> Независимого резервного маршрута нет.
        </p>
      )}
    </div>
  );
}
