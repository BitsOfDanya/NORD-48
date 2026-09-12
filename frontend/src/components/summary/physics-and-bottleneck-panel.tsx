"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import type { ClientMetrics, PhysicsSummary } from "@/types/simulation";

/** Compact, read-only display of already-computed physics/bottleneck data
 * — no new calculation happens here, see docs/physical-model.md. */

const REASON_LABELS: Record<string, string> = {
  ROUTE_AVAILABLE: "Маршрут есть",
  NO_VISIBLE_SATELLITE: "Нет видимого спутника",
  NO_GATEWAY_CONTACT: "Нет контакта со шлюзом",
  ISL_NETWORK_SPLIT: "Разрыв ISL-сети",
  GATEWAY_OUTAGE: "Плановый простой шлюза",
};

const REASON_COLOR: Record<string, string> = {
  ROUTE_AVAILABLE: "bg-status-ok",
  NO_VISIBLE_SATELLITE: "bg-status-bad",
  NO_GATEWAY_CONTACT: "bg-status-warn",
  ISL_NETWORK_SPLIT: "bg-status-bad/70",
  GATEWAY_OUTAGE: "bg-muted-foreground/60",
};

function formatMs(seconds: number | null): string {
  return seconds == null ? "—" : `${(seconds * 1000).toFixed(1)} мс`;
}

function BottleneckBar({ percentages }: { percentages: Record<string, number> }) {
  const order = Object.keys(REASON_LABELS).filter((key) => percentages[key] != null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        {order.map((key) => (
          <div
            key={key}
            className={REASON_COLOR[key] ?? "bg-muted-foreground"}
            style={{ width: `${percentages[key]}%` }}
            title={`${REASON_LABELS[key] ?? key}: ${percentages[key].toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        {order.map((key) => (
          <span key={key}>
            {REASON_LABELS[key] ?? key} {percentages[key].toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function PhysicsAndBottleneckPanel({
  physics,
  metrics,
}: {
  physics: PhysicsSummary;
  metrics: Record<string, ClientMetrics>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Физика орбиты и причины перерывов</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Период обращения</p>
            <p className="font-mono font-semibold">{formatDuration(Math.round(physics.orbital_period_s))}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Витков/сутки</p>
            <p className="font-mono font-semibold">{physics.revolutions_per_day.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Радиус зоны покрытия</p>
            <p className="font-mono font-semibold">{Math.round(physics.coverage_footprint.ground_radius_km)} км</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">
              Геометрическая задержка (mean / p95)
            </p>
            <p className="font-mono font-semibold">
              {formatMs(physics.geometric_propagation_delay_s.mean)} /{" "}
              {formatMs(physics.geometric_propagation_delay_s.p95)}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Задержка — только геометрическое время прохождения сигнала (distance / c), без обработки,
          очередей и RF-канала (нет входных данных для них).
        </p>

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-xs font-medium">
            Декомпозиция причин отсутствия маршрута за весь горизонт (per client)
          </p>
          {Object.values(metrics).map((client) => (
            <div key={client.client_id} className="flex flex-col gap-1">
              <span className="text-xs font-mono text-muted-foreground">{client.client_id}</span>
              <BottleneckBar percentages={client.bottleneck_breakdown.percentages} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
