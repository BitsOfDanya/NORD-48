"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatPercent } from "@/lib/format";
import type { MonteCarloResult } from "@/types/resilience";
import type { RoutingStrategy } from "@/types/simulation";

const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
  maximum_margin: "Максимальный запас",
  maximum_persistence: "Максимальная стабильность",
};

const STRATEGY_COLORS: Record<RoutingStrategy, string> = {
  minimum_hops: "var(--color-chart-1)",
  minimum_distance: "var(--color-chart-2)",
  maximum_margin: "var(--color-chart-3)",
  maximum_persistence: "var(--color-chart-4)",
};

function StatBlock({ value, label, tone }: { value: string; label: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-secondary/50 px-2.5 py-2">
      <span
        className={
          "font-mono text-base font-semibold leading-none tabular-nums " +
          (tone === "ok"
            ? "text-status-ok"
            : tone === "warn"
              ? "text-status-warn"
              : tone === "bad"
                ? "text-status-bad"
                : "text-foreground")
        }
      >
        {value}
      </span>
      <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
    </div>
  );
}

function tone(fraction: number): "ok" | "warn" | "bad" {
  if (fraction >= 0.95) return "ok";
  if (fraction >= 0.7) return "warn";
  return "bad";
}

export function MonteCarloResults({ result }: { result: MonteCarloResult }) {
  const [failedListOpen, setFailedListOpen] = useState(false);

  const chartData = result.client_ids.map((clientId) => {
    const row: Record<string, string | number> = { client: clientId };
    for (const strategy of result.strategies) {
      const stats = strategy.per_client.find((c) => c.client_id === clientId);
      row[strategy.strategy] = stats ? Number((stats.mean * 100).toFixed(2)) : 0;
    }
    return row;
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Результат стресс-теста</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-2">
            <StatBlock value={String(result.parameters.failed_satellites_count)} label="отказов (K)" />
            <StatBlock value={String(result.parameters.iterations)} label="итераций" />
            <StatBlock value={String(result.parameters.candidate_satellite_count)} label="кандидатов" />
            <StatBlock value={`${Math.round(result.target_availability * 100)}%`} label="цель доступности" />
          </div>
          {result.parameters.requested_failed_satellites_count !==
            result.parameters.failed_satellites_count && (
            <p className="text-xs text-status-warn">
              Запрошено K = {result.parameters.requested_failed_satellites_count}, ограничено
              размером группировки до K = {result.parameters.failed_satellites_count}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="ring-primary/40">
        <CardHeader>
          <CardTitle>Рекомендуемая стратегия</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Badge className="w-fit">{STRATEGY_LABELS[result.recommended_strategy]}</Badge>
          <p className="text-sm text-muted-foreground">{result.recommended_reason}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {result.strategies.map((strategy) => (
          <Card
            key={strategy.strategy}
            className={strategy.strategy === result.recommended_strategy ? "ring-primary/50" : ""}
          >
            <CardHeader>
              <CardTitle className="text-sm">{STRATEGY_LABELS[strategy.strategy]}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-1.5">
              <StatBlock
                value={formatPercent(strategy.all_clients_target_fraction * 100)}
                label="доля испытаний с целью по всем пунктам"
                tone={tone(strategy.all_clients_target_fraction)}
              />
              <StatBlock
                value={formatPercent(strategy.p05_worst_client_availability * 100)}
                label="P5 худшего пункта"
                tone={tone(strategy.p05_worst_client_availability)}
              />
              <StatBlock
                value={formatPercent(strategy.mean_worst_client_availability * 100)}
                label="средняя доступность худшего пункта"
                tone={tone(strategy.mean_worst_client_availability)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Средняя доступность по пунктам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="client" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => `${value}%`}
                />
                <Legend
                  formatter={(value) => STRATEGY_LABELS[value as RoutingStrategy] ?? value}
                  wrapperStyle={{ fontSize: 12 }}
                />
                {result.strategies.map((strategy) => (
                  <Bar
                    key={strategy.strategy}
                    dataKey={strategy.strategy}
                    fill={STRATEGY_COLORS[strategy.strategy]}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Распределение доступности</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-2 font-medium">Стратегия</th>
                <th className="px-2 py-2 text-right font-medium">Пункт</th>
                <th className="px-2 py-2 text-right font-medium">P5</th>
                <th className="px-2 py-2 text-right font-medium">P50</th>
                <th className="px-2 py-2 text-right font-medium">P95</th>
                <th className="py-2 pl-2 text-right font-medium">Цель достигнута</th>
              </tr>
            </thead>
            <tbody>
              {result.strategies.flatMap((strategy) =>
                strategy.per_client.map((client) => (
                  <tr key={`${strategy.strategy}-${client.client_id}`} className="border-b border-border/60">
                    <td className="py-2 pr-2 text-muted-foreground">
                      {STRATEGY_LABELS[strategy.strategy]}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-medium text-foreground">
                      {client.client_id}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatPercent(client.p05 * 100)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatPercent(client.p50 * 100)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatPercent(client.p95 * 100)}
                    </td>
                    <td className="py-2 pl-2 text-right font-mono tabular-nums">
                      {formatPercent(client.target_success_fraction * 100)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {result.worst_trial && (
        <Card>
          <CardHeader>
            <CardTitle>Худший случай</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm">
              Пункт <strong className="font-mono">{result.worst_trial.worst_client_id}</strong>:
              доступность {formatPercent(result.worst_trial.worst_client_availability * 100)} при
              стратегии {STRATEGY_LABELS[result.recommended_strategy]}
            </p>

            {Object.keys(result.worst_trial.diagnostic_breakdown).length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  Причины перерывов связи
                </p>
                {Object.entries(result.worst_trial.diagnostic_breakdown).map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{diagnosticReasonLabel(reason)}</span>
                    <span className="font-mono">{count}</span>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setFailedListOpen((v) => !v)}
            >
              {failedListOpen ? "Скрыть список аппаратов" : "Открыть список аппаратов"}
            </Button>
            {failedListOpen && (
              <div className="flex flex-wrap gap-1">
                {result.worst_trial.failed_satellites.map((sat) => (
                  <span
                    key={sat}
                    className="rounded border border-status-bad/40 bg-status-bad/10 px-2 py-0.5 font-mono text-xs text-status-bad"
                  >
                    {sat}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
