"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Play, TrendingDown } from "lucide-react";
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
import { JobProgress } from "@/components/ui/job-progress";
import { useFailureDegradationRun } from "@/hooks/use-failure-degradation";
import { getExample } from "@/lib/api/scenarios";
import { formatPercent } from "@/lib/format";
import { applyRobustWinnerPlanes, ROBUST_WINNER_LABEL } from "@/lib/robust-winner";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const DEFAULT_K_VALUES = "0,1,2,3,4,5,6,8,10";

export function FailureDegradation({ defaultScenarioId }: { defaultScenarioId: string }) {
  const persisted = useAppStore((s) => s.failureDegradation);
  const setState = useAppStore((s) => s.setFailureDegradationState);
  const { data: scenario } = useQuery({
    queryKey: ["failure-degradation-scenario", defaultScenarioId],
    queryFn: () => getExample(defaultScenarioId),
  });

  const [kValuesText, setKValuesText] = useState(DEFAULT_K_VALUES);
  const [iterations, setIterations] = useState(100);
  const [seed, setSeed] = useState(42);
  const [compareRobust, setCompareRobust] = useState(false);

  const baseline = useFailureDegradationRun((result) => setState({ result }));
  const robust = useFailureDegradationRun((result) => setState({ robustResult: result }));

  const finalResult = persisted.result;
  const finalRobustResult = persisted.robustResult;
  const running = baseline.running || robust.running;

  const start = () => {
    const k_values = kValuesText
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0);
    const routing_strategy: RoutingStrategy = "minimum_hops";
    setState({ result: null, robustResult: compareRobust ? null : persisted.robustResult });
    baseline.start({ scenario_id: defaultScenarioId, routing_strategy, k_values, iterations, seed });
    if (compareRobust && scenario) {
      robust.start({
        scenario: applyRobustWinnerPlanes(scenario),
        routing_strategy,
        k_values,
        iterations,
        seed,
      });
    }
  };

  const showComparison = Boolean(finalRobustResult);
  const chartData = useMemo(() => {
    const byK = new Map<number, { k: number; baseline?: number; robust?: number }>();
    for (const p of finalResult?.points ?? []) {
      byK.set(p.k, { ...(byK.get(p.k) ?? { k: p.k }), baseline: p.median_worst_availability_percent });
    }
    for (const p of finalRobustResult?.points ?? []) {
      byK.set(p.k, { ...(byK.get(p.k) ?? { k: p.k }), robust: p.median_worst_availability_percent });
    }
    return Array.from(byK.values()).sort((a, b) => a.k - b.k);
  }, [finalResult, finalRobustResult]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Деградация при потере спутников</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            K=0..2 — точный исчерпывающий расчёт (K=1: все 48 одиночных отказов, K=2: все 1128
            пар — переиспользует N-1/N-2). K≥3 — оценка Monte Carlo (существующая
            инфраструктура), не полный перебор. Методология не смешивается — каждая точка
            помечена явно.
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Значения K (через запятую)</span>
            <Input value={kValuesText} onChange={(e) => setKValuesText(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Итераций Monte Carlo (для K≥3)</span>
            <Input type="number" value={iterations} onChange={(e) => setIterations(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Seed</span>
            <Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={compareRobust} onCheckedChange={(v) => setCompareRobust(Boolean(v))} />
            Сравнить с {ROBUST_WINNER_LABEL}
          </label>
          <Button onClick={start} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Считаем..." : "Построить кривую"}
          </Button>
          {baseline.error && <p className="text-sm text-status-bad">{baseline.error}</p>}
          {robust.error && <p className="text-sm text-status-bad">{robust.error}</p>}
          {baseline.job && baseline.running && (
            <JobProgress
              primaryLabel={`Baseline${baseline.job.current_k != null ? ` · K=${baseline.job.current_k}` : ""}`}
              secondaryLabel={`${baseline.job.evaluated} / ${baseline.job.total}`}
              evaluated={baseline.job.evaluated}
              total={baseline.job.total}
            />
          )}
          {robust.job && robust.running && (
            <JobProgress
              primaryLabel={`${ROBUST_WINNER_LABEL}${robust.job.current_k != null ? ` · K=${robust.job.current_k}` : ""}`}
              secondaryLabel={`${robust.job.evaluated} / ${robust.job.total}`}
              evaluated={robust.job.evaluated}
              total={robust.job.total}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!finalResult && !running && (
          <EmptyState
            icon={TrendingDown}
            title="Кривая деградации ещё не рассчитана"
            description="Постройте кривую, чтобы увидеть, как быстро падает доступность при потере всё большего числа спутников."
            action={
              <Button size="sm" onClick={start}>
                <Play className="h-3.5 w-3.5" />
                Построить кривую
              </Button>
            }
          />
        )}

        {finalResult && (
          <>
            <Card>
              <CardHeader><CardTitle>Медианная worst availability vs число отказавших спутников</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeOpacity={0.15} />
                      <XAxis dataKey="k" tick={{ fontSize: 11 }} label={{ value: "K отказавших спутников", fontSize: 10, position: "insideBottom", offset: -5 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} labelFormatter={(l) => `K=${l}`} />
                      {showComparison && <Legend wrapperStyle={{ fontSize: 11 }} />}
                      <ReferenceLine
                        y={finalResult.target_availability * 100}
                        stroke="var(--color-status-ok)"
                        strokeDasharray="4 4"
                        label={{ value: "target", fontSize: 10, position: "insideTopRight" }}
                      />
                      <Line type="monotone" dataKey="baseline" name="Baseline" stroke="var(--color-chart-1)" dot={{ r: 3 }} />
                      {showComparison && (
                        <Line type="monotone" dataKey="robust" name={ROBUST_WINNER_LABEL} stroke="var(--color-status-ok)" dot={{ r: 3 }} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Вероятность сохранить target (P(target survives))</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2">K</th>
                      <th className="text-center">Метод</th>
                      <th className="text-right">Baseline survival</th>
                      {showComparison && <th className="text-right">{ROBUST_WINNER_LABEL} survival</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {finalResult.points.map((point) => {
                      const robustPoint = finalRobustResult?.points.find((p) => p.k === point.k);
                      return (
                        <tr key={point.k} className="border-t border-border">
                          <td className="py-2 font-medium">{point.k}</td>
                          <td className="text-center">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${point.method === "exact" ? "bg-status-ok/10 text-status-ok" : "bg-secondary text-muted-foreground"}`}
                            >
                              {point.method === "exact" ? "exact" : "Monte Carlo"}
                            </span>
                          </td>
                          <td className="text-right font-mono">{formatPercent(point.target_survival_fraction * 100)}</td>
                          {showComparison && (
                            <td className="text-right font-mono text-status-ok">
                              {robustPoint ? formatPercent(robustPoint.target_survival_fraction * 100) : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">
                  P(target survives) — доля случаев (точный перебор при K≤2, {finalResult.iterations}{" "}
                  прогонов Monte Carlo при K≥3, seed={finalResult.seed}), где ВСЕ клиенты сохраняют
                  доступность ≥{(finalResult.target_availability * 100).toFixed(0)}%.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
