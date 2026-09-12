"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Play, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useIslSensitivity, useIslSensitivityComparison } from "@/hooks/use-isl-sensitivity";
import { getExample } from "@/lib/api/scenarios";
import { applyRobustWinnerPlanes, ROBUST_WINNER_LABEL } from "@/lib/robust-winner";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const DEFAULT_ISL_VALUES = [
  1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2750, 2800, 2900, 3000, 3100, 3200,
];

export function IslSensitivityPanel({ scenarioId }: { scenarioId: string }) {
  const analysis = useIslSensitivity();
  const comparison = useIslSensitivityComparison();
  const persisted = useAppStore((s) => s.islSensitivity);
  const result = analysis.data ?? persisted.result ?? undefined;
  const robustResult = comparison.data ?? persisted.robustResult ?? undefined;
  const { data: scenario } = useQuery({
    queryKey: ["isl-sensitivity-scenario", scenarioId],
    queryFn: () => getExample(scenarioId),
  });

  const [valuesText, setValuesText] = useState(DEFAULT_ISL_VALUES.join(","));
  const [refine, setRefine] = useState(true);
  const [compareRobust, setCompareRobust] = useState(false);

  const run = () => {
    const isl_values_km = valuesText
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    const routing_strategy: RoutingStrategy = "minimum_hops";
    analysis.mutate({
      scenario_id: scenarioId,
      routing_strategy,
      isl_values_km,
      refine,
      refine_step_km: 50,
    });
    if (compareRobust && scenario) {
      comparison.mutate({
        scenario: applyRobustWinnerPlanes(scenario),
        routing_strategy,
        isl_values_km,
        refine,
        refine_step_km: 50,
      });
    }
  };

  const chartData = useMemo(() => {
    const byIsl = new Map<number, { isl: number; baseline?: number; robust?: number }>();
    for (const p of [...(result?.coarse_points ?? []), ...(result?.refined_points ?? [])]) {
      const row = byIsl.get(p.isl_range_km) ?? { isl: p.isl_range_km };
      row.baseline = p.worst_availability_percent;
      byIsl.set(p.isl_range_km, row);
    }
    for (const p of [...(robustResult?.coarse_points ?? []), ...(robustResult?.refined_points ?? [])]) {
      const row = byIsl.get(p.isl_range_km) ?? { isl: p.isl_range_km };
      row.robust = p.worst_availability_percent;
      byIsl.set(p.isl_range_km, row);
    }
    return Array.from(byIsl.values()).sort((a, b) => a.isl - b.isl);
  }, [result, robustResult]);

  const showComparison = Boolean(robustResult);
  const deltaKm =
    result?.minimum_isl_range_km != null && robustResult?.minimum_isl_range_km != null
      ? result.minimum_isl_range_km - robustResult.minimum_isl_range_km
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Чувствительность к дальности ISL</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Точный пересчёт (не аппроксимация) на каждой точке сетки. Первая проходящая
            точка по возрастанию — минимум среди проверенных значений (при допущении, что
            большая дальность ISL не ухудшает связность).
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Значения ISL, км (через запятую)</span>
            <Input value={valuesText} onChange={(e) => setValuesText(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={refine} onCheckedChange={(v) => setRefine(Boolean(v))} />
            Уточнить границу с шагом 50 км
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={compareRobust} onCheckedChange={(v) => setCompareRobust(Boolean(v))} />
            Сравнить с {ROBUST_WINNER_LABEL}
          </label>
          <Button onClick={run} disabled={analysis.isPending || comparison.isPending}>
            {analysis.isPending || comparison.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {analysis.isPending || comparison.isPending ? "Считаем..." : "Запустить sweep"}
          </Button>
          {analysis.error && (
            <p className="text-sm text-status-bad">{analysis.error.message}</p>
          )}
          {comparison.error && (
            <p className="text-sm text-status-bad">{comparison.error.message}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!result && !analysis.isPending && (
          <EmptyState
            icon={Radio}
            title="Дальность ISL ещё не рассчитана"
            description="Запустите sweep, чтобы найти минимальную дальность межспутниковой линии, при которой worst availability достигает target. Включите сравнение, чтобы увидеть ту же кривую для Recommended Robust."
            action={
              <Button size="sm" onClick={run}>
                <Play className="h-3.5 w-3.5" />
                Запустить sweep
              </Button>
            }
          />
        )}

        {result && (
          <>
            <div className={`grid gap-4 ${showComparison ? "md:grid-cols-2" : ""}`}>
              <Card className="ring-1 ring-primary/30">
                <CardHeader><CardTitle>Требуемая дальность ISL — Baseline</CardTitle></CardHeader>
                <CardContent>
                  {result.minimum_isl_found && result.minimum_isl_range_km != null ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-status-ok" />
                      <p className="font-mono text-3xl font-semibold tabular-nums">
                        {result.minimum_isl_range_km} км
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Target не достигнут ни на одной из проверенных точек.
                    </p>
                  )}
                </CardContent>
              </Card>

              {showComparison && robustResult && (
                <Card className="ring-1 ring-status-ok/40">
                  <CardHeader><CardTitle>Требуемая дальность ISL — {ROBUST_WINNER_LABEL}</CardTitle></CardHeader>
                  <CardContent>
                    {robustResult.minimum_isl_found && robustResult.minimum_isl_range_km != null ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-6 w-6 shrink-0 text-status-ok" />
                        <p className="font-mono text-3xl font-semibold tabular-nums">
                          {robustResult.minimum_isl_range_km} км
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Target не достигнут ни на одной из проверенных точек.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader><CardTitle>Доступность худшего пункта и дальность ISL</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeOpacity={0.15} />
                      <XAxis dataKey="isl" tick={{ fontSize: 11 }} unit=" км" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} labelFormatter={(l) => `${l} км`} />
                      {showComparison && <Legend wrapperStyle={{ fontSize: 11 }} />}
                      <ReferenceLine
                        y={result.target_availability * 100}
                        stroke="var(--color-status-ok)"
                        strokeDasharray="4 4"
                        label={{ value: "target", fontSize: 10, position: "insideTopRight" }}
                      />
                      {result.minimum_isl_range_km != null && (
                        <ReferenceLine x={result.minimum_isl_range_km} stroke="var(--color-primary)" strokeDasharray="4 4" />
                      )}
                      {showComparison && robustResult?.minimum_isl_range_km != null && (
                        <ReferenceLine x={robustResult.minimum_isl_range_km} stroke="var(--color-status-ok)" strokeDasharray="4 4" />
                      )}
                      <Line type="monotone" dataKey="baseline" name="Baseline" stroke="var(--color-chart-1)" dot={{ r: 2 }} connectNulls />
                      {showComparison && (
                        <Line type="monotone" dataKey="robust" name={ROBUST_WINNER_LABEL} stroke="var(--color-status-ok)" dot={{ r: 2 }} connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {showComparison && robustResult && (
              <Card>
                <CardHeader><CardTitle>Инженерный вывод</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-foreground">
                    {result.minimum_isl_range_km != null && robustResult.minimum_isl_range_km != null ? (
                      deltaKm != null && deltaKm > 0 ? (
                        <>
                          {ROBUST_WINNER_LABEL} сохраняет target начиная с{" "}
                          <strong>{robustResult.minimum_isl_range_km} км</strong>, Baseline — с{" "}
                          <strong>{result.minimum_isl_range_km} км</strong>. Найденная конфигурация
                          снижает требуемую дальность ISL на <strong>{deltaKm} км</strong> (среди
                          проверенных значений сетки).
                        </>
                      ) : deltaKm === 0 ? (
                        <>
                          Обе конфигурации достигают target с одной и той же минимальной найденной
                          дальностью ISL — <strong>{result.minimum_isl_range_km} км</strong>. Найденная
                          RAAN/phase-фазировка не снижает требование к дальности ISL.
                        </>
                      ) : (
                        <>
                          {ROBUST_WINNER_LABEL} требует бо́льшую дальность ISL (
                          <strong>{robustResult.minimum_isl_range_km} км</strong>) для target, чем
                          Baseline (<strong>{result.minimum_isl_range_km} км</strong>) — честно
                          показанный компромисс, не скрыт.
                        </>
                      )
                    ) : (
                      "Target ≥90% при ограниченной дальности ISL не достигнут ни одной из конфигураций в проверенном диапазоне."
                    )}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
