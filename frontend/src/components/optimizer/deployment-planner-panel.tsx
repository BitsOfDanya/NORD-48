"use client";

import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getDeploymentPlanResult,
  getDeploymentPlanStatus,
  startDeploymentPlan,
} from "@/lib/api/deployment";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

function pct(value: number) {
  return `${(value * 100).toFixed(2).replace(".", ",")} %`;
}

const STAGE_SIZE_PRESETS = [16, 32, 48];
const SEARCH_CAPS = [
  { label: "Быстро (до 20 спутников)", value: 20 },
  { label: "Средне (до 32 спутников)", value: 32 },
  { label: "Полный проход (48, ~5 мин)", value: 48 },
];

export function DeploymentPlannerPanel({ scenarioId }: { scenarioId: string }) {
  const persisted = useAppStore((s) => s.deploymentPlan);
  const setDeploymentPlanState = useAppStore((s) => s.setDeploymentPlanState);
  const setUploadedScenario = useAppStore((s) => s.setUploadedScenario);

  const [maxSearchSize, setMaxSearchSize] = useState(32);
  const [refine, setRefine] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const job = persisted.job;
  const result = persisted.result;

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await getDeploymentPlanStatus(job.run_id);
        setDeploymentPlanState({ job: status });
        if (status.status === "completed") {
          setDeploymentPlanState({ result: await getDeploymentPlanResult(status.run_id) });
        }
        if (status.status === "failed") setError(status.error ?? "Расчёт завершился с ошибкой");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (caught: any) {
        setError(caught?.message ?? "Ошибка API");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, setDeploymentPlanState]);

  const start = async () => {
    setError(null);
    setDeploymentPlanState({ result: null });
    try {
      const routing_strategy: RoutingStrategy = "minimum_hops";
      const request = {
        scenario_id: scenarioId,
        routing_strategy,
        stage_sizes: STAGE_SIZE_PRESETS.filter((s) => s <= maxSearchSize),
        refine_budget: refine ? 50 : 0,
        refine_seed: 42,
        max_search_size: maxSearchSize,
      };
      setDeploymentPlanState({ formValues: request });
      const created = await startDeploymentPlan(request);
      setDeploymentPlanState({ job: created });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (caught: any) {
      setError(caught?.message ?? "Не удалось запустить планировщик");
    }
  };

  const running = job && ["queued", "running"].includes(job.status);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Deployment Sequence Planner</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Жадный конструктивный поиск: на каждом шаге добавляется спутник, сильнее
            всего улучшающий худшего клиента прямо сейчас. Не полный перебор (см.
            docs/deployment-planner.md) — эвристика, но детерминированная и
            воспроизводимая.
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Глубина поиска</span>
            <Select value={String(maxSearchSize)} onValueChange={(v) => setMaxSearchSize(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEARCH_CAPS.map((cap) => (
                  <SelectItem key={cap.value} value={String(cap.value)}>{cap.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={refine} onCheckedChange={(v) => setRefine(Boolean(v))} />
            Уточнить RAAN/phase для каждого этапа после выбора состава
          </label>
          <Button onClick={start} disabled={Boolean(running)}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Считаем..." : "Запустить планировщик"}
          </Button>
          {error && <p className="text-sm text-status-bad">{error}</p>}
          {running && job && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Спутников проверено: {job.evaluated} / {job.total}</span>
                <span>Лучший worst: {job.best_worst_availability != null ? pct(job.best_worst_availability) : "—"}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${job.total ? (job.evaluated / job.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!result && !running && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Запустите планировщик, чтобы найти лучший состав группировки для 16/32/48
              активных аппаратов и минимальный размер группировки для target ≥90%.
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Минимальный размер группировки для target ≥90%</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                {result.minimum_constellation_size_found ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-status-ok" />
                    <div>
                      <p className="text-2xl font-semibold">
                        {result.minimum_constellation_size} <span className="text-sm font-normal text-muted-foreground">из {result.total_satellites}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        При равномерном распределении по плоскостям (см. состав ниже).
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-8 w-8 shrink-0 text-status-warn" />
                    <p className="text-sm text-muted-foreground">
                      Target не достигнут в исследованном диапазоне (до {result.searched_up_to_size}
                      {" "}из {result.total_satellites}). {result.search_capped ? "Поиск был ограничен — увеличьте глубину поиска." : ""}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Доступность по размеру группировки</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={result.size_curve.map((e) => ({ size: e.size, worst: e.worst_availability * 100 }))}
                    >
                      <CartesianGrid strokeOpacity={0.15} />
                      <XAxis dataKey="size" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} labelFormatter={(l) => `N=${l}`} />
                      <ReferenceLine y={result.target_availability * 100} stroke="var(--color-status-ok)" strokeDasharray="4 4" label={{ value: "target 90%", fontSize: 10, position: "insideTopRight" }} />
                      <Line type="monotone" dataKey="worst" stroke="var(--color-chart-1)" dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Этапы развёртывания</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2">Этап</th>
                      <th className="text-right">Worst availability</th>
                      <th className="text-right">Худший перерыв</th>
                      <th className="text-right">По плоскостям</th>
                      <th className="text-center">Target</th>
                      <th className="text-right">В моделирование</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stages.map((stage) => (
                      <tr key={stage.size} className="border-t border-border">
                        <td className="py-2 font-medium">{stage.size} спутников</td>
                        <td className="text-right font-mono">{pct(stage.subset.worst_availability)}</td>
                        <td className="text-right font-mono">
                          {Math.round(stage.subset.worst_max_outage_s / 60)} мин
                        </td>
                        <td className="text-right font-mono text-xs">
                          {Object.entries(stage.subset.planes)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([plane, count]) => `${plane}:${count}`)
                            .join(" ")}
                        </td>
                        <td className="text-center">
                          {stage.subset.target_feasible ? (
                            <CheckCircle2 className="mx-auto h-4 w-4 text-status-ok" />
                          ) : (
                            <XCircle className="mx-auto h-4 w-4 text-status-bad" />
                          )}
                        </td>
                        <td className="text-right">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              if (stage.refined) setUploadedScenario(stage.refined.derived_scenario);
                            }}
                            disabled={!stage.refined}
                            title={stage.refined ? undefined : "Запущено без RAAN/phase refine"}
                          >
                            Открыть
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">
                  Состав каждого этапа — лучший найденный жадным алгоритмом, не «первая
                  запущенная плоскость». Сравнение с готовым сценарием
                  «Первая очередь» — в docs/deployment-planner.md.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
