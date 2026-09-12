"use client";

import { Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

import { RecoveryComparison } from "@/components/comparison/recovery-comparison";
import { ErrorBanner } from "@/components/layout/error-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompare } from "@/hooks/use-compare";
import { formatDuration, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { ComparisonResult, ComparisonVariant } from "@/types/comparison";

const STRATEGY_LABELS: Record<string, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
  maximum_margin: "Максимальный запас",
  maximum_persistence: "Максимальная устойчивость пути",
};

function toneForDelta(delta: number): "ok" | "warn" | "bad" {
  if (delta > 0.01) return "ok";
  if (delta < -0.01) return "bad";
  return "warn";
}

function VariantLabel({
  runId,
  scenarioTitle,
  createdAt,
}: {
  runId: string;
  scenarioTitle: string | null;
  createdAt: string | null;
}) {
  return (
    <span className="flex flex-col">
      <span className="font-medium text-foreground">{scenarioTitle ?? runId.slice(0, 8)}</span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {runId.slice(0, 8)} {createdAt ? `· ${new Date(createdAt).toLocaleTimeString("ru-RU")}` : ""}
      </span>
    </span>
  );
}

function ConfigDiff({ variant }: { variant: ComparisonVariant }) {
  const changes = variant.changed_parameters;
  const [expanded, setExpanded] = useState(false);
  if (changes.length === 0) {
    return <p className="text-xs text-muted-foreground">Конфигурация совпадает с baseline.</p>;
  }
  const shown = expanded ? changes : changes.slice(0, 6);
  return (
    <div className="flex flex-col gap-1">
      {shown.map((change) => (
        <div key={change.path} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate font-mono text-muted-foreground" title={change.path}>
            {change.path}
          </span>
          <span className="font-mono">
            {JSON.stringify(change.before)} → <strong>{JSON.stringify(change.after)}</strong>
          </span>
        </div>
      ))}
      {changes.length > 6 && (
        <button
          type="button"
          className="w-fit text-[11px] text-primary hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Свернуть" : `Показать ещё ${changes.length - 6}`}
        </button>
      )}
    </div>
  );
}

function ComparisonResults({ result }: { result: ComparisonResult }) {
  const [detailedFor, setDetailedFor] = useState<string | null>(null);
  const chartData = useMemo(() => {
    const clientIds = new Set<string>();
    for (const variant of result.variants) {
      for (const clientId of Object.keys(variant.metrics)) clientIds.add(clientId);
    }
    return Array.from(clientIds).map((clientId) => {
      const row: Record<string, string | number> = { client: clientId };
      for (const variant of result.variants) {
        row[variant.run_id.slice(0, 8)] = variant.metrics[clientId]?.availability_percent ?? 0;
      }
      return row;
    });
  }, [result]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Ключевой результат</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.variants.map((variant) => (
            <div
              key={variant.run_id}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border p-3",
                variant.is_baseline ? "border-primary/50 bg-primary/5" : "border-border"
              )}
            >
              <div className="flex items-center gap-1.5">
                {variant.is_baseline && <Star className="h-3.5 w-3.5 fill-primary text-primary" />}
                <VariantLabel
                  runId={variant.run_id}
                  scenarioTitle={variant.scenario_title}
                  createdAt={null}
                />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xl font-semibold tabular-nums">
                  {formatPercent(variant.worst_availability_percent)}
                </span>
                {!variant.is_baseline && (
                  <span
                    className={cn(
                      "font-mono text-xs",
                      toneForDelta(variant.worst_availability_delta_pp) === "ok" && "text-status-ok",
                      toneForDelta(variant.worst_availability_delta_pp) === "bad" && "text-status-bad",
                      toneForDelta(variant.worst_availability_delta_pp) === "warn" && "text-status-warn"
                    )}
                  >
                    {variant.worst_availability_delta_pp >= 0 ? "+" : ""}
                    {variant.worst_availability_delta_pp.toFixed(2)} п.п.
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Худшая доступность · target {variant.target_status}
              </p>
              {!variant.is_baseline && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border/60 pt-1.5">
                  {Object.entries(variant.deltas_from_baseline).map(([clientId, delta]) => (
                    <span key={clientId} className="font-mono text-[11px] text-muted-foreground">
                      {clientId}{" "}
                      <span
                        className={
                          toneForDelta(delta.availability_percent) === "ok"
                            ? "text-status-ok"
                            : toneForDelta(delta.availability_percent) === "bad"
                              ? "text-status-bad"
                              : "text-status-warn"
                        }
                      >
                        {delta.availability_percent >= 0 ? "+" : ""}
                        {delta.availability_percent.toFixed(2)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Доступность по пунктам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="client" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} unit="%" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {result.variants.map((variant, i) => (
                  <Bar
                    key={variant.run_id}
                    dataKey={variant.run_id.slice(0, 8)}
                    fill={`var(--color-chart-${(i % 5) + 1})`}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {result.variants.map((variant) => (
          <Card key={variant.run_id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                {variant.is_baseline && <Star className="h-3 w-3 fill-primary text-primary" />}
                Изменения конфигурации · {variant.scenario_title ?? variant.run_id.slice(0, 8)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ConfigDiff variant={variant} />
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setDetailedFor(detailedFor === variant.run_id ? null : variant.run_id)}
              >
                {detailedFor === variant.run_id ? "Скрыть подробные метрики" : "Подробные метрики"}
              </Button>
              {detailedFor === variant.run_id && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                        <th className="py-1.5 pr-2 font-medium">Пункт</th>
                        <th className="px-2 py-1.5 text-right font-medium">Доступность</th>
                        <th className="px-2 py-1.5 text-right font-medium">Δ vs baseline</th>
                        <th className="px-2 py-1.5 text-right font-medium">Перерыв</th>
                        <th className="px-2 py-1.5 text-right font-medium">Переходов</th>
                        <th className="px-2 py-1.5 text-right font-medium">Смен маршрута</th>
                        <th className="px-2 py-1.5 text-right font-medium">Запас (P5)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(variant.metrics).map(([clientId, metric]) => (
                        <tr key={clientId} className="border-b border-border/60">
                          <td className="py-1.5 pr-2 font-mono font-medium text-foreground">{clientId}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {formatPercent(metric.availability_percent)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {variant.deltas_from_baseline[clientId]
                              ? `${variant.deltas_from_baseline[clientId].availability_percent >= 0 ? "+" : ""}${variant.deltas_from_baseline[clientId].availability_percent.toFixed(2)}`
                              : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {formatDuration(metric.max_outage_s)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {metric.average_hops?.toFixed(2) ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {metric.route_change_count}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {metric.p05_bottleneck_margin != null
                              ? formatPercent(metric.p05_bottleneck_margin * 100)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {result.variants.length >= 2 && (
        <div className="flex flex-col gap-3">
          {result.variants
            .filter((variant) => !variant.is_baseline)
            .map((variant) => {
              const baseline = result.variants.find((v) => v.is_baseline);
              if (!baseline) return null;
              return (
                <RecoveryComparison
                  key={variant.run_id}
                  baselineRunId={baseline.run_id}
                  baselineLabel={baseline.scenario_title ?? baseline.run_id.slice(0, 8)}
                  candidateRunId={variant.run_id}
                  candidateLabel={variant.scenario_title ?? variant.run_id.slice(0, 8)}
                />
              );
            })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Резюме устойчивости (N-1/N-2/Monte Carlo) не добавляется автоматически — эти анализы не
        привязаны к конкретному запуску. Запустите их отдельно на странице «Устойчивость» для
        выбранного сценария.
      </p>
    </div>
  );
}

export function ComparisonWorkspace() {
  const runHistory = useAppStore((s) => s.runHistory);
  const comparisonQueue = useAppStore((s) => s.comparisonQueue);
  const clearComparisonQueue = useAppStore((s) => s.clearComparisonQueue);
  const persisted = useAppStore((s) => s.compare);
  const setCompareState = useAppStore((s) => s.setCompareState);
  const compare = useCompare();

  // A freshly queued run (via "Добавить в сравнение" elsewhere) always
  // joins the persisted selection rather than replacing it, so queuing a
  // second run from another page adds to, not resets, an in-progress
  // comparison.
  const selected = useMemo(
    () => Array.from(new Set([...persisted.selectedRunIds, ...comparisonQueue])),
    [persisted.selectedRunIds, comparisonQueue]
  );
  const baselineId = persisted.baselineRunId;
  const result = compare.data ?? persisted.result ?? undefined;

  const setSelected = (next: string[]) => setCompareState({ selectedRunIds: next });
  const setBaselineId = (id: string | null) => setCompareState({ baselineRunId: id });

  // Fold a freshly queued run into the persisted selection once, then
  // drain the queue — otherwise "Добавить в сравнение" would only ever
  // affect this render's derived `selected`, never survive a reload.
  useEffect(() => {
    if (comparisonQueue.length === 0) return;
    const merged = Array.from(new Set([...persisted.selectedRunIds, ...comparisonQueue])).slice(
      0,
      10
    );
    setCompareState({
      selectedRunIds: merged,
      baselineRunId: persisted.baselineRunId ?? merged[0] ?? null,
    });
    clearComparisonQueue();
  }, [comparisonQueue, persisted.selectedRunIds, persisted.baselineRunId, setCompareState, clearComparisonQueue]);

  const toggle = (runId: string) => {
    if (selected.includes(runId)) {
      const next = selected.filter((id) => id !== runId);
      setSelected(next);
      if (baselineId === runId) setBaselineId(next[0] ?? null);
      return;
    }
    if (selected.length >= 10) return;
    setSelected([...selected, runId]);
    if (!baselineId) setBaselineId(runId);
  };

  const remove = (runId: string) => toggle(runId);

  const canCompare = selected.length >= 2 && selected.length <= 10;

  const handleCompare = () => {
    if (!canCompare) return;
    compare.mutate({ run_ids: selected, baseline_run_id: baselineId ?? undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Сравнение вариантов</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {selected.map((runId) => {
                const entry = runHistory.find((r) => r.run_id === runId);
                return (
                  <Badge
                    key={runId}
                    variant={baselineId === runId ? "default" : "secondary"}
                    className="h-8 gap-1.5 px-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => setBaselineId(runId)}
                      title="Сделать baseline"
                      className="flex items-center"
                    >
                      <Star className={cn("h-3 w-3", baselineId === runId && "fill-current")} />
                    </button>
                    {entry?.scenario_title ?? runId.slice(0, 8)}
                    <button type="button" onClick={() => remove(runId)} className="opacity-70 hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Завершённые расчёты ({runHistory.length})
            </p>
            {runHistory.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Запустите расчёт на странице «Моделирование» — он появится здесь для сравнения.
              </p>
            )}
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {runHistory.map((entry) => (
                <label
                  key={entry.run_id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(entry.run_id)}
                    onChange={() => toggle(entry.run_id)}
                    disabled={!selected.includes(entry.run_id) && selected.length >= 10}
                  />
                  <VariantLabel
                    runId={entry.run_id}
                    scenarioTitle={entry.scenario_title}
                    createdAt={entry.created_at}
                  />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {STRATEGY_LABELS[entry.routing_strategy] ?? entry.routing_strategy}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleCompare} disabled={!canCompare || compare.isPending}>
              {compare.isPending ? "Сравнение..." : "Сравнить"}
            </Button>
            {selected.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCompareState({ selectedRunIds: [], baselineRunId: null, result: null });
                  clearComparisonQueue();
                }}
              >
                Очистить
              </Button>
            )}
            {selected.length === 1 && (
              <p className="text-xs text-muted-foreground">Выберите ещё минимум один вариант.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {compare.error ? <ErrorBanner error={compare.error} /> : null}
      {result && <ComparisonResults result={result} />}
    </div>
  );
}
