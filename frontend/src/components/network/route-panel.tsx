"use client";

import { ArrowRight, CheckCircle2, Minus, XCircle } from "lucide-react";

import { BackupRoutePanel } from "@/components/network/backup-route-panel";
import { OutageExplainer } from "@/components/network/outage-explainer";
import { diagnosticCheckRows, diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock, formatDistanceKm, formatDuration, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/ui/help-tip";
import { useAppStore } from "@/store/app-store";
import type { RouteRecord, TimelineStep } from "@/types/simulation";

function isBottleneckSegment(
  a: string,
  b: string,
  bottleneckEdge: [string, string] | null
): boolean {
  if (!bottleneckEdge) return false;
  const [x, y] = bottleneckEdge;
  return (a === x && b === y) || (a === y && b === x);
}

function marginTone(margin: number): "ok" | "warn" | "bad" {
  if (margin >= 0.5) return "ok";
  if (margin >= 0.2) return "warn";
  return "bad";
}

function lifetimeTone(seconds: number): "ok" | "warn" | "bad" {
  if (seconds > 1800) return "ok";
  if (seconds >= 600) return "warn";
  return "bad";
}

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

export function RoutePanel({
  route,
  runId,
  clientSteps,
  selectedTimeS,
  stepS,
}: {
  route: RouteRecord | undefined;
  runId?: string | null;
  clientSteps?: TimelineStep[];
  selectedTimeS?: number;
  stepS?: number;
}) {
  const requestFocusNorthernSites = useAppStore((s) => s.requestFocusNorthernSites);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Маршрут в выбранный момент {route ? `· ${formatClock(route.t_s)}` : ""}
          <HelpTip label="Как читать маршрут">Последовательность узлов от наземного пункта до шлюза. Жёлтая стрелка отмечает участок с минимальным запасом.</HelpTip>
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
            {route.path.map((node, i) => {
              const nextNode = route.path[i + 1];
              const onBottleneck =
                nextNode != null && isBottleneckSegment(node, nextNode, route.bottleneck_edge);
              return (
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
                    <span
                      title={
                        onBottleneck
                          ? `Самый слабый участок маршрута${
                              route.bottleneck_margin != null
                                ? ` · запас ${formatPercent(route.bottleneck_margin * 100)}`
                                : ""
                            }`
                          : undefined
                      }
                    >
                      <ArrowRight
                        className={cn("h-3 w-3", onBottleneck ? "text-status-warn" : "text-text-muted")}
                      />
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Количество переходов</span>
              <span className="font-mono font-medium">{route.hops}</span>
            </div>
            {route.total_distance_km != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Суммарная длина</span>
                <span className="font-mono font-medium">{formatDistanceKm(route.total_distance_km)}</span>
              </div>
            )}
            {route.bottleneck_margin != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1 text-muted-foreground">Запас узкого места <HelpTip>Нормированный запас самого слабого участка маршрута до предельной дальности связи.</HelpTip></span>
                <span
                  className={cn(
                    "font-mono font-medium",
                    marginTone(route.bottleneck_margin) === "ok" && "text-status-ok",
                    marginTone(route.bottleneck_margin) === "warn" && "text-status-warn",
                    marginTone(route.bottleneck_margin) === "bad" && "text-status-bad"
                  )}
                  title={
                    route.bottleneck_edge
                      ? `Узкое место: ${route.bottleneck_edge[0]} — ${route.bottleneck_edge[1]}`
                      : undefined
                  }
                >
                  {formatPercent(route.bottleneck_margin * 100)}
                </span>
              </div>
            )}
            {route.route_lifetime_s != null && (
              <div className="mt-1 rounded-md bg-secondary/50 p-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Сохранится без перестроения</span>
                  <span
                    className={cn(
                      "font-mono font-semibold",
                      lifetimeTone(route.route_lifetime_s) === "ok" && "text-status-ok",
                      lifetimeTone(route.route_lifetime_s) === "warn" && "text-status-warn",
                      lifetimeTone(route.route_lifetime_s) === "bad" && "text-status-bad"
                    )}
                  >
                    {formatDuration(route.route_lifetime_s)}
                  </span>
                </div>
                {route.route_valid_until_s != null && (
                  <p className="mt-0.5 text-right text-[11px] text-text-muted">
                    до {formatClock(route.route_valid_until_s)}
                  </p>
                )}
              </div>
            )}
          </div>
          {runId && (
            <BackupRoutePanel runId={runId} clientId={route.client_id} tS={route.t_s} />
          )}
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
          {runId && clientSteps && selectedTimeS != null && stepS != null && (
            <OutageExplainer
              runId={runId}
              clientId={route.client_id}
              steps={clientSteps}
              selectedTimeS={selectedTimeS}
              stepS={stepS}
              reason={route.diagnostic_reason}
            />
          )}
        </>
      )}
    </div>
  );
}
