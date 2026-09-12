"use client";

import { CheckCircle2, Layers, Loader2, Play, XCircle } from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { JobProgress } from "@/components/ui/job-progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getDeploymentPlanResult,
  getDeploymentPlanStatus,
  startDeploymentPlan,
} from "@/lib/api/deployment";
import { ApiError } from "@/lib/api/client";
import { ROBUST_WINNER_LABEL, ROBUST_WINNER_PLANES } from "@/lib/robust-winner";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const ROBUST_WINNER_PLANE_PARAMETERS = Object.fromEntries(
  Object.entries(ROBUST_WINNER_PLANES).flatMap(([planeId, angles]) => [
    [`${planeId}.raan_deg`, angles.raan_deg],
    [`${planeId}.phase_deg`, angles.phase_deg],
  ])
);

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
  const [localSearch, setLocalSearch] = useState(false);
  const [useRobustGeometry, setUseRobustGeometry] = useState(false);
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
      } catch (caught: unknown) {
        if (caught instanceof ApiError && caught.status === 404) {
          setDeploymentPlanState({ job: null });
          setError("Сохранённая задача плана развёртывания устарела. Запустите расчёт повторно.");
          return;
        }
        setError(caught instanceof Error ? caught.message : "Ошибка API");
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
        one_swap_passes: localSearch ? 2 : 0,
        tabu_iterations: localSearch ? 20 : 0,
        tabu_candidates_per_iteration: 24,
        tabu_tenure: 5,
        local_search_seed: 42,
        max_search_size: maxSearchSize,
        ...(useRobustGeometry ? { plane_parameters: ROBUST_WINNER_PLANE_PARAMETERS } : {}),
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
            всего улучшающий худшего клиента прямо сейчас. Опционально — точное
            best-improvement 1-swap и ограниченный tabu-поиск поверх найденного состава
            (не полный перебор, см. docs/deployment-planner.md) — эвристики, но
            детерминированные и воспроизводимые.
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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={localSearch} onCheckedChange={(v) => setLocalSearch(Boolean(v))} />
            Улучшить состав локальным поиском (1-swap + tabu) после greedy
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={useRobustGeometry}
              onCheckedChange={(v) => setUseRobustGeometry(Boolean(v))}
            />
            Планировать под геометрию {ROBUST_WINNER_LABEL} (а не углы сценария по умолчанию)
          </label>
          <Button onClick={start} disabled={Boolean(running)}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Считаем..." : "Запустить планировщик"}
          </Button>
          {error && <p className="text-sm text-status-bad">{error}</p>}
          {running && job && (
            <JobProgress
              primaryLabel="Спутников проверено"
              secondaryLabel={`лучший worst: ${job.best_worst_availability != null ? pct(job.best_worst_availability) : "—"}`}
              evaluated={job.evaluated}
              total={job.total}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!result && !running && (
          <EmptyState
            icon={Layers}
            title="План развёртывания ещё не рассчитан"
            description="Запустите планировщик, чтобы найти лучший состав группировки для 16/32/48 активных аппаратов и минимальный размер группировки для target ≥90%."
            action={
              <Button size="sm" onClick={start}>
                <Play className="h-3.5 w-3.5" />
                Запустить планировщик
              </Button>
            }
          />
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
              <CardContent>
                <div className="flex flex-col gap-0 overflow-x-auto lg:flex-row lg:items-stretch lg:gap-0">
                  {result.stages.map((stage, index) => {
                    const previous = result.stages[index - 1];
                    const added = previous ? stage.size - previous.size : stage.size;
                    const marginPp = (stage.subset.worst_availability - result.target_availability) * 100;
                    return (
                      <div key={stage.size} className="flex items-stretch lg:flex-1">
                        {index > 0 && (
                          <div className="hidden w-12 shrink-0 flex-col items-center justify-center text-[11px] text-text-muted lg:flex">
                            <span className="text-primary">→</span>
                            <span>+{added}</span>
                          </div>
                        )}
                        <div className="min-w-[220px] flex-1 rounded-md border border-border/60 bg-secondary/20 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-text-muted">Этап {index + 1}</p>
                          <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
                            {stage.size} <span className="text-sm font-normal text-muted-foreground">спутников</span>
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {Object.entries(stage.subset.planes)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([plane, count]) => `${plane}:${count}`)
                              .join(" · ")}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-semibold tabular-nums">{pct(stage.subset.worst_availability)}</span>
                            {stage.subset.target_feasible ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-ok">
                                <CheckCircle2 className="h-3 w-3" /> PASS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-bad">
                                <XCircle className="h-3 w-3" /> FAIL
                              </span>
                            )}
                          </div>
                          <p className={`text-[11px] ${marginPp >= 0 ? "text-status-ok" : "text-status-bad"}`}>
                            {marginPp >= 0 ? "+" : ""}{marginPp.toFixed(2)} пп к target · {Math.round(stage.subset.worst_max_outage_s / 60)} мин перерыв
                          </p>
                          {stage.local_search && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              1-swap+tabu: {stage.local_search.improvement >= 0 ? "+" : ""}
                              {(stage.local_search.improvement * 100).toFixed(2)} пп
                              ({stage.local_search.one_swap_evaluations + stage.local_search.tabu_evaluations} доп. оценок)
                            </p>
                          )}
                          <Button
                            size="xs"
                            variant="outline"
                            className="mt-2 w-full"
                            onClick={() => {
                              const target = stage.refined?.derived_scenario ?? stage.derived_scenario;
                              if (target) setUploadedScenario(target);
                            }}
                          >
                            Открыть в моделировании
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Каждый следующий этап включает состав предыдущего целиком (Stage 1 ⊂ Stage 2 ⊂
                  Stage 3) — жадная последовательность только добавляет спутники, не заменяет
                  ранее выбранные. Состав каждого этапа — лучший найденный жадным алгоритмом, не
                  «первая запущенная плоскость». Сравнение с готовым сценарием «Первая очередь» —
                  в docs/deployment-planner.md.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
