"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { formatDuration, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { ClientMetrics } from "@/types/simulation";

function ClientTabs({ clientIds }: { clientIds: string[] }) {
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const setSelectedClientId = useAppStore((s) => s.setSelectedClientId);

  return (
    <div className="flex gap-1 rounded-md bg-secondary/60 p-1">
      {clientIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setSelectedClientId(id)}
          className={cn(
            "flex-1 rounded px-2 py-1.5 font-mono text-sm font-medium transition-colors",
            selectedClientId === id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function SelectedClientMetrics({ metrics }: { metrics: ClientMetrics }) {
  const achieved = metrics.target_achieved;
  const deltaPp = (metrics.availability_fraction - metrics.target_availability) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-text-muted">Доступность связи</p>
        <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {formatPercent(metrics.availability_percent)}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Цель ≥ {Math.round(metrics.target_availability * 100)} %</span>
          {achieved ? (
            <span className="inline-flex items-center gap-1 rounded bg-status-ok/15 px-1.5 py-0.5 font-medium text-status-ok">
              <CheckCircle2 className="h-3 w-3" /> Норма
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-status-bad/15 px-1.5 py-0.5 font-medium text-status-bad">
              <XCircle className="h-3 w-3" />
              {deltaPp >= 0 ? "+" : ""}
              {deltaPp.toFixed(2).replace(".", ",")} п.п.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <MetricRow label="Видимость спутника" value={formatPercent(metrics.visibility_percent)} />
        <MetricRow label="Макс. перерыв" value={formatDuration(metrics.max_outage_s)} />
        <MetricRow label="Число перерывов" value={String(metrics.outage_count)} />
        <MetricRow
          label="Среднее число переходов"
          value={metrics.average_hops != null ? metrics.average_hops.toFixed(1).replace(".", ",") : "—"}
        />
        <MetricRow label="Изменений маршрута" value={String(metrics.route_change_count)} />
      </div>
    </div>
  );
}

export function ClientMetricsPanel({ metrics }: { metrics: Record<string, ClientMetrics> | undefined }) {
  const clientIds = metrics ? Object.keys(metrics) : [];
  const selectedClientId = useAppStore((s) => s.selectedClientId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        Наземный пункт
      </p>

      {clientIds.length === 0 && (
        <p className="text-sm text-muted-foreground">Показатели появятся после запуска расчёта.</p>
      )}

      {clientIds.length > 0 && (
        <>
          <ClientTabs clientIds={clientIds} />
          {selectedClientId && metrics?.[selectedClientId] && (
            <SelectedClientMetrics metrics={metrics[selectedClientId]} />
          )}
        </>
      )}
    </div>
  );
}
