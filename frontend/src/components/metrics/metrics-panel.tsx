"use client";

import { formatDuration, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { ClientMetrics } from "@/types/simulation";

function ClientTabs({ clientIds }: { clientIds: string[] }) {
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const setSelectedClientId = useAppStore((s) => s.setSelectedClientId);

  return (
    <div className="flex gap-1 rounded-md border border-border bg-muted p-1">
      {clientIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setSelectedClientId(id)}
          className={cn(
            "flex-1 rounded px-2 py-1.5 text-sm font-medium transition-colors",
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
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function SelectedClientMetrics({ metrics }: { metrics: ClientMetrics }) {
  const achieved = metrics.target_achieved;
  const deltaPp = (metrics.availability_fraction - metrics.target_availability) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
          Доступность связи
        </p>
        <p
          className={cn(
            "text-3xl font-semibold tabular-nums",
            achieved ? "text-status-ok" : "text-status-bad"
          )}
        >
          {formatPercent(metrics.availability_percent)}
        </p>
        <p className="text-xs text-muted-foreground">
          Цель ≥ {Math.round(metrics.target_availability * 100)} %
          {achieved ? (
            <span className="ml-1 text-status-ok">· Норма</span>
          ) : (
            <span className="ml-1 text-status-bad">
              · Ниже целевого уровня ({deltaPp >= 0 ? "+" : ""}
              {deltaPp.toFixed(2).replace(".", ",")} п.п.)
            </span>
          )}
        </p>
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

export function MetricsPanel({ metrics }: { metrics: Record<string, ClientMetrics> | undefined }) {
  const clientIds = metrics ? Object.keys(metrics) : [];
  const selectedClientId = useAppStore((s) => s.selectedClientId);

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        Наземный пункт
      </p>

      {clientIds.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Показатели появятся после запуска расчёта.
        </p>
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
