"use client";

import { ArrowDown, CheckCircle2, XCircle } from "lucide-react";

import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock, formatDistanceKm } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RouteRecord } from "@/types/simulation";

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {ok ? (
        <span className="inline-flex items-center gap-1 font-medium text-status-ok">
          <CheckCircle2 className="h-3.5 w-3.5" /> есть
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium text-status-bad">
          <XCircle className="h-3.5 w-3.5" /> отсутствует
        </span>
      )}
    </div>
  );
}

export function RoutePanel({ route }: { route: RouteRecord | undefined }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        Текущий маршрут {route ? `· ${formatClock(route.t_s)}` : ""}
      </p>

      {!route && (
        <p className="text-sm text-muted-foreground">Выберите наземный пункт, чтобы увидеть маршрут.</p>
      )}

      {route && route.available && (
        <>
          <div className="flex flex-col items-start gap-0.5 text-sm">
            {route.path.map((node, i) => (
              <div key={`${node}-${i}`} className="flex flex-col items-start">
                <span
                  className={cn(
                    "rounded border px-2 py-0.5 font-mono text-xs",
                    i === 0 || i === route.path.length - 1
                      ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                      : "border-border bg-muted"
                  )}
                >
                  {node}
                </span>
                {i < route.path.length - 1 && (
                  <ArrowDown className="my-0.5 h-3 w-3 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Переходов</span>
              <span className="font-medium">{route.hops}</span>
            </div>
            {route.total_distance_km != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Длина</span>
                <span className="font-medium">{formatDistanceKm(route.total_distance_km)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {route && !route.available && (
        <>
          <p className="text-sm font-semibold text-status-bad">Связь отсутствует</p>
          {route.diagnostic_reason && (
            <p className="text-sm text-muted-foreground">
              Причина: <strong className="text-foreground">{diagnosticReasonLabel(route.diagnostic_reason)}</strong>
            </p>
          )}
          {route.diagnostic_checks && (
            <div className="flex flex-col gap-1 rounded-md border border-border p-2">
              <CheckRow label="Видимый спутник" ok={route.diagnostic_checks.visible_satellite} />
              <CheckRow label="Контакт со шлюзом" ok={route.diagnostic_checks.gateway_contact} />
              <CheckRow label="Связность ISL" ok={route.diagnostic_checks.isl_connectivity} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
