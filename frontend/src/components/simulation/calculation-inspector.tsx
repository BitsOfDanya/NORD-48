"use client";

import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock, formatDistanceKm, formatDuration, formatPercent } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { ClientMetrics, RoutingStrategy, SimulationRunSummary, SnapshotView } from "@/types/simulation";

const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  minimum_hops: "minimum_hops (минимум переходов)",
  minimum_distance: "minimum_distance (минимальная длина)",
  maximum_margin: "maximum_margin (максимальный запас)",
  maximum_persistence: "maximum_persistence (максимальная стабильность)",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">{title}</p>
      {children}
    </div>
  );
}

export function CalculationInspector({
  run,
  snapshot,
  metrics,
}: {
  run: SimulationRunSummary | undefined;
  snapshot: SnapshotView | undefined;
  metrics: ClientMetrics | undefined;
}) {
  const open = useAppStore((s) => s.calculationInspectorOpen);
  const setOpen = useAppStore((s) => s.setCalculationInspectorOpen);
  const selectedClientId = useAppStore((s) => s.selectedClientId);

  const route = selectedClientId ? snapshot?.routes[selectedClientId] : undefined;
  const activeCount = snapshot?.satellites.filter((s) => s.active).length;
  const islCount = snapshot?.edges.filter((e) => e.kind === "isl").length;
  const groundCount = snapshot?.edges.filter((e) => e.kind === "ground_contact").length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Расчётные данные</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <Section title="Сценарий">
            <Row label="Сценарий" value={run?.scenario_title ?? "—"} />
            <Row label="Расчётный горизонт" value={run ? `${formatDuration(run.horizon_s)} (${run.horizon_s} с)` : "—"} />
            <Row label="Шаг" value={run ? `${run.step_s} с` : "—"} />
            <Row label="Состояний сети" value={run ? String(run.n_steps) : "—"} />
          </Section>

          <Section title="Текущий момент">
            <Row label="Время" value={snapshot ? `${formatClock(snapshot.t_s)} (t = ${snapshot.t_s} с)` : "—"} />
            <Row label="Активных аппаратов" value={activeCount != null ? String(activeCount) : "—"} />
            <Row label="ISL-контактов" value={islCount != null ? String(islCount) : "—"} />
            <Row label="Наземных контактов" value={groundCount != null ? String(groundCount) : "—"} />
          </Section>

          <Section title="Маршрутизация">
            <Row label="Client" value={selectedClientId ?? "—"} />
            <Row label="Gateway" value={route?.gateway_id ?? run?.gateway_ids[0] ?? "—"} />
            <Row label="Routing" value={run ? STRATEGY_LABELS[run.routing_strategy] : "—"} />
            <Row label="Текущий путь" value={route?.available ? route.path.join(" → ") : "—"} />
            <Row label="Переходов" value={route?.available ? String(route.hops) : "—"} />
            <Row
              label="Длина пути"
              value={route?.available && route.total_distance_km != null ? formatDistanceKm(route.total_distance_km) : "—"}
            />
            <Row
              label="Запас узкого места"
              value={
                route?.available && route.bottleneck_margin != null
                  ? `${formatPercent(route.bottleneck_margin * 100)}${
                      route.bottleneck_edge ? ` (${route.bottleneck_edge[0]} — ${route.bottleneck_edge[1]})` : ""
                    }`
                  : "—"
              }
            />
            <Row
              label="Сохранится без перестроения"
              value={route?.route_lifetime_s != null ? formatDuration(route.route_lifetime_s) : "—"}
            />
            <Row
              label="Действителен до"
              value={route?.route_valid_until_s != null ? formatClock(route.route_valid_until_s) : "—"}
            />
            {route && !route.available && (
              <Row label="Причина отсутствия" value={diagnosticReasonLabel(route.diagnostic_reason) ?? "—"} />
            )}
          </Section>

          <Section title="Показатели за сутки">
            <Row label="Availability" value={metrics ? formatPercent(metrics.availability_percent) : "—"} />
            <Row label="Visibility" value={metrics ? formatPercent(metrics.visibility_percent) : "—"} />
            <Row label="Max outage" value={metrics ? `${formatDuration(metrics.max_outage_s)} (${metrics.max_outage_s} с)` : "—"} />
            <Row
              label="Целевая доступность"
              value={metrics ? metrics.target_availability.toFixed(2).replace(".", ",") : "—"}
            />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
