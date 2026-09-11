"use client";

import { ArrowRight, CheckCircle2, Minus, XCircle } from "lucide-react";

import { diagnosticCheckRows, diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock, formatDistanceKm } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { RouteRecord } from "@/types/simulation";

function CheckRow({ label, state, value }: { label: string; state: "ok" | "bad" | "warn" | "na"; value: string }) {
  const icon =
    state === "ok" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-status-ok" />
    ) : state === "bad" ? (
      <XCircle className="h-3.5 w-3.5 text-status-bad" />
    ) : state === "warn" ? (
      <XCircle className="h-3.5 w-3.5 text-status-warn" />
    ) : (
      <Minus className="h-3.5 w-3.5 text-text-muted" />
    );

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium",
          state === "ok" && "text-status-ok",
          state === "bad" && "text-status-bad",
          state === "warn" && "text-status-warn",
          state === "na" && "text-text-muted"
        )}
      >
        {icon} {value}
      </span>
    </div>
  );
}

export function RoutePanel({ route }: { route: RouteRecord | undefined }) {
  const requestFocusNorthernSites = useAppStore((s) => s.requestFocusNorthernSites);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Текущий маршрут {route ? `· ${formatClock(route.t_s)}` : ""}
        </p>
        {route && (
          <button
            type="button"
            onClick={requestFocusNorthernSites}
            className="text-[11px] text-primary hover:underline"
          >
            Показать на глобусе
          </button>
        )}
      </div>

      {!route && (
        <p className="text-sm text-muted-foreground">Выберите наземный пункт, чтобы увидеть маршрут.</p>
      )}

      {route && route.available && (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {route.path.map((node, i) => (
              <span key={`${node}-${i}`} className="flex items-center gap-1">
                <span
                  className={cn(
                    "rounded border px-2 py-0.5 font-mono text-xs",
                    i === 0 || i === route.path.length - 1
                      ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                      : "border-border bg-secondary/60 text-foreground"
                  )}
                >
                  {node}
                </span>
                {i < route.path.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-text-muted" />
                )}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Переходов</span>
              <span className="font-mono font-medium">{route.hops}</span>
            </div>
            {route.total_distance_km != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Длина</span>
                <span className="font-mono font-medium">{formatDistanceKm(route.total_distance_km)}</span>
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
          <div className="flex flex-col gap-1 rounded-md border border-border p-2">
            {diagnosticCheckRows(route.diagnostic_reason).map((row) => (
              <CheckRow key={row.label} label={row.label} state={row.state} value={row.value} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
