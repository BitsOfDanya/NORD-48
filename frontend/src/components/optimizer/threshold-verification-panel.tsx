"use client";

import { CheckCircle2, Loader2, Play, Target, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { JobProgress } from "@/components/ui/job-progress";
import {
  getThresholdVerificationResult,
  getThresholdVerificationStatus,
  startThresholdVerification,
} from "@/lib/api/deployment";
import { formatPercent as pct } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const DEFAULT_SIZES = [40, 41, 42, 43, 44, 45];

export function ThresholdVerificationPanel({ scenarioId }: { scenarioId: string }) {
  const persisted = useAppStore((s) => s.thresholdVerification);
  const setState = useAppStore((s) => s.setThresholdVerificationState);

  const [sizesText, setSizesText] = useState(DEFAULT_SIZES.join(","));
  const [maxPasses, setMaxPasses] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const job = persisted.job;
  const result = persisted.result;

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await getThresholdVerificationStatus(job.run_id);
        setState({ job: status });
        if (status.status === "completed") {
          setState({ result: await getThresholdVerificationResult(status.run_id) });
        }
        if (status.status === "failed") setError(status.error ?? "Расчёт завершился с ошибкой");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Ошибка API");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, setState]);

  const start = async () => {
    setError(null);
    setState({ result: null });
    try {
      const sizes = sizesText
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const routing_strategy: RoutingStrategy = "minimum_hops";
      const request = { scenario_id: scenarioId, routing_strategy, sizes, max_passes: maxPasses };
      setState({ formValues: request });
      const created = await startThresholdVerification(request);
      setState({ job: created });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось запустить проверку");
    }
  };

  const running = job && ["queued", "running"].includes(job.status);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Проверка порога размера группировки</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Для каждого N: жадный поиск, затем локальное улучшение обменами (swap
            refinement) — независимая от порядка добавления проверка. Это НЕ полный перебор
            C(48, N) и не математическое доказательство глобального оптимума — только
            повышение уверенности в найденном пороге (см. docs/design-threshold-verification.md).
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Размеры N (через запятую)</span>
            <Input value={sizesText} onChange={(e) => setSizesText(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Проходов swap-refinement (макс.)</span>
            <Input
              type="number"
              value={maxPasses}
              onChange={(e) => setMaxPasses(Number(e.target.value))}
            />
          </label>
          <Button onClick={start} disabled={Boolean(running)}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Считаем..." : "Запустить проверку"}
          </Button>
          {error && <p className="text-sm text-status-bad">{error}</p>}
          {running && job && (
            <JobProgress
              primaryLabel={`${job.phase === "refine" ? "Уточнение обменами" : "Жадный поиск"}${job.current_size != null ? ` · N=${job.current_size}` : ""}`}
              secondaryLabel={`${job.evaluated} / ${job.total}`}
              evaluated={job.evaluated}
              total={job.total}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!result && !running && (
          <EmptyState
            icon={Target}
            title="Порог размера ещё не рассчитан"
            description="Запустите проверку, чтобы независимо подтвердить (или опровергнуть) минимальный размер группировки, найденный жадным алгоритмом."
            action={
              <Button size="sm" onClick={start}>
                <Play className="h-3.5 w-3.5" />
                Запустить проверку
              </Button>
            }
          />
        )}

        {result && (
          <>
            <Card className="ring-1 ring-primary/40">
              <CardHeader>
                <CardTitle>Первый найденный размер, достигающий target</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                {result.first_verified_pass_size != null ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-status-ok" />
                    <div>
                      <p className="text-2xl font-semibold">
                        N = {result.first_verified_pass_size}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Подтверждено swap-refinement (не только жадным порядком добавления). Это
                        минимальный размер, найденный текущим поиском — не доказанный глобальный
                        оптимум.
                      </p>
                      {result.greedy_only_minimum_size != null &&
                        result.greedy_only_minimum_size !== result.first_verified_pass_size && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Жадный поиск без уточнения давал N = {result.greedy_only_minimum_size}.
                          </p>
                        )}
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-8 w-8 shrink-0 text-status-warn" />
                    <p className="text-sm text-muted-foreground">
                      Ни один из проверенных размеров ({result.sizes_tested.join(", ")}) не
                      подтверждён как достигающий target ≥{(result.target_availability * 100).toFixed(0)}%
                      после уточнения. Проверьте бо́льшие N.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Результаты по N</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2">N</th>
                      <th className="text-right">Жадный worst</th>
                      <th className="text-right">После уточнения</th>
                      <th className="text-right">Запас до target</th>
                      <th className="text-right">Обменов применено</th>
                      <th className="text-right">Оценок</th>
                      <th className="text-center">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.points.map((point) => (
                      <tr
                        key={point.size}
                        className={`border-t border-border ${point.size === result.first_verified_pass_size ? "bg-status-ok/5" : ""}`}
                      >
                        <td className="py-2 font-medium">{point.size}</td>
                        <td className="text-right font-mono">
                          {pct(point.greedy_worst_availability_percent)}
                        </td>
                        <td className="text-right font-mono">
                          {pct(point.refined_worst_availability_percent)}
                        </td>
                        <td
                          className={`text-right font-mono ${point.target_margin_pp >= 0 ? "text-status-ok" : "text-status-bad"}`}
                        >
                          {point.target_margin_pp >= 0 ? "+" : ""}
                          {point.target_margin_pp.toFixed(2)} п.п.
                        </td>
                        <td className="text-right font-mono text-xs">
                          {point.swaps_applied.length}
                        </td>
                        <td className="text-right font-mono text-xs">{point.evaluations}</td>
                        <td className="text-center">
                          {point.target_feasible ? (
                            <CheckCircle2 className="mx-auto h-4 w-4 text-status-ok" />
                          ) : (
                            <XCircle className="mx-auto h-4 w-4 text-status-bad" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {result.marginal_gain_curve.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Предельная полезность добавления спутника</CardTitle></CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Δ worst availability (п.п.) при добавлении N-го спутника к жадной
                    последовательности — где отдача убывает быстрее всего.
                  </p>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={result.marginal_gain_curve}>
                        <CartesianGrid strokeOpacity={0.15} />
                        <XAxis dataKey="size" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="пп" />
                        <Tooltip
                          formatter={(v) => `${Number(v).toFixed(2)} п.п.`}
                          labelFormatter={(l) => `N=${l}`}
                        />
                        <Bar dataKey="marginal_gain_pp" fill="var(--color-chart-1)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
