"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Play, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AcceptanceMatrix } from "@/components/optimizer/acceptance-matrix";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { JobProgress } from "@/components/ui/job-progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AcceptanceRow } from "@/lib/acceptance-reference";
import { getExample } from "@/lib/api/scenarios";
import { getOptimizationResult, getOptimizationStatus, startOptimization } from "@/lib/api/optimization";
import { ApiError } from "@/lib/api/client";
import { useAppStore } from "@/store/app-store";
import type { OptimizationRequest, OptimizationResult } from "@/types/optimization";

const DEFAULT_PARAMETERS = ["P2.raan_deg", "P3.raan_deg", "P2.phase_deg", "P3.phase_deg"];
const PROFILE_LABELS: Record<string, string> = {
  "01_full_constellation": "Нормальная работа",
  "03_satellite_outages": "Отказы 10 аппаратов",
  "04_link_range": "ISL 2000 км",
};

const MODE_EXPLANATIONS: Record<OptimizationRequest["mode"], string> = {
  normal: "Максимизирует доступность худшего пункта только в штатном сценарии. Подходит для быстрой оценки, но не защищает результат в деградированных условиях.",
  robust: "Максимизирует худшую доступность по всем выбранным условиям без отдельной гарантии для штатного режима. Исследовательский режим: результат может обменять штатную доступность на устойчивость.",
  constrained_robust: "Сначала требует не менее 90% доступности в штатном сценарии, затем максимизирует устойчивость в деградированных условиях. Рекомендуется для инженерного решения.",
  robust_design: "Требует не менее 90% в штатном режиме и отдельно максимизирует худший результат между отказами аппаратов и ISL 2000 км. Так одно деградированное условие не маскирует другое.",
  failure_cvar: "Требует не менее 90% в штатном режиме, затем максимизирует CVaR — среднее качество в худшей доле банка смоделированных наборов из K одновременных отказов спутников (фиксированный + случайные + коррелированные + adversarial). Специализированный кандидат для устойчивости к случайным множественным отказам, не замена штатному Robust Design.",
};

const FAILURE_CVAR_PROFILE_LABELS: Record<string, string> = {
  "03_satellite_outages": "Отказы 10 аппаратов",
};

function pct(value: number) {
  return `${(value * 100).toFixed(2).replace(".", ",")} %`;
}

function angleDelta(value: number, baseline: number) {
  return ((value - baseline + 540) % 360) - 180;
}

function buildAcceptanceRow(result: OptimizationResult, normalScenarioId: string): AcceptanceRow {
  const normalRow =
    result.best.scenarios.find((s) => s.scenario_id === normalScenarioId) ?? result.best.scenarios[0];
  const outagesRow = result.best.scenarios.find((s) => s.scenario_id === "03_satellite_outages");
  const islRow = result.best.scenarios.find((s) => s.scenario_id === "04_link_range");
  const degradedRows = [outagesRow, islRow].filter((r): r is NonNullable<typeof r> => Boolean(r));
  return {
    name: "Текущий результат оптимизации",
    source: `mode=${result.mode}, ${result.evaluated} кандидатов`,
    normalWorstPercent: normalRow.worst_availability * 100,
    outagesWorstPercent: (outagesRow?.worst_availability ?? normalRow.worst_availability) * 100,
    isl2000WorstPercent: (islRow?.worst_availability ?? normalRow.worst_availability) * 100,
    n1Status: "info",
    n2Status: "info",
    worstMaxOutageS: result.best.aggregates.worst_max_outage_s,
    targetNormal: normalRow.target_violations === 0 ? "pass" : "fail",
    targetDegraded:
      degradedRows.length === 0
        ? "info"
        : degradedRows.every((r) => r.target_violations === 0)
          ? "pass"
          : "fail",
  };
}

export function OptimizerWorkspace() {
  const router = useRouter();
  const scenarioId = useAppStore((state) => state.selectedScenarioId);
  const setUploadedScenario = useAppStore((state) => state.setUploadedScenario);
  const persisted = useAppStore((state) => state.optimizer);
  const setOptimizerState = useAppStore((state) => state.setOptimizerState);
  const { data: scenario } = useQuery({ queryKey: ["optimizer-scenario", scenarioId], queryFn: () => getExample(scenarioId) });

  const [mode, setMode] = useState<OptimizationRequest["mode"]>(persisted.formValues?.mode ?? "constrained_robust");
  const [variables, setVariables] = useState(persisted.formValues?.variable_parameters ?? DEFAULT_PARAMETERS);
  const [profiles, setProfiles] = useState(persisted.formValues?.stress_profile_ids ?? Object.keys(PROFILE_LABELS));
  const [budget, setBudget] = useState(persisted.formValues?.budget ?? 100);
  const [seed, setSeed] = useState(persisted.formValues?.seed ?? 42);
  const [algorithm, setAlgorithm] = useState<OptimizationRequest["algorithm"]>(
    persisted.formValues?.algorithm ?? "differential_evolution"
  );
  const [initialSize, setInitialSize] = useState(persisted.formValues?.initial_exploration_size ?? 16);
  const [fixedFailureProfile, setFixedFailureProfile] = useState(
    persisted.formValues?.fixed_failure_profile_id ?? "03_satellite_outages"
  );
  const [failureCount, setFailureCount] = useState(persisted.formValues?.failure_count ?? 10);
  const [cvarAlpha, setCvarAlpha] = useState(persisted.formValues?.cvar_alpha ?? 0.1);
  const [adversarialRounds, setAdversarialRounds] = useState(
    persisted.formValues?.adversarial_rounds ?? 0
  );
  const [outerRestarts, setOuterRestarts] = useState(persisted.formValues?.outer_restarts ?? 1);
  const [advancedBounds, setAdvancedBounds] = useState(false);
  const [bounds, setBounds] = useState<Record<string, { minimum: number; maximum: number }>>(
    persisted.formValues?.bounds ?? {}
  );
  const [error, setError] = useState<string | null>(null);

  const job = persisted.job;
  const result = persisted.result;

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await getOptimizationStatus(job.run_id);
        setOptimizerState({ job: status });
        if (status.status === "completed") {
          setOptimizerState({ result: await getOptimizationResult(status.run_id) });
        }
        if (status.status === "failed") setError(status.error ?? "Расчёт завершился с ошибкой");
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) {
          setOptimizerState({ job: null });
          setError("Сохранённая задача оптимизации устарела после обновления сервиса. Запустите поиск повторно.");
          return;
        }
        setError(caught instanceof Error ? caught.message : "Ошибка API");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [job, setOptimizerState]);

  const baselineParameters = useMemo(
    () =>
      Object.fromEntries(
        (scenario?.design.planes ?? []).flatMap((plane) => [
          [`${plane.id}.raan_deg`, plane.raan_deg],
          [`${plane.id}.phase_deg`, plane.phase_deg],
        ])
      ),
    [scenario]
  );

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) =>
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const start = async () => {
    setError(null);
    setOptimizerState({ result: null });
    try {
      // constrained_robust/robust_design require scenario_id to be one of
      // the stress profiles (it IS the constrained "normal" one) — guard
      // against the active scenario not being one of the three defaults.
      const stressProfiles =
        (mode === "constrained_robust" || mode === "robust_design") && !profiles.includes(scenarioId)
          ? [scenarioId, ...profiles]
          : profiles;
      const request: OptimizationRequest = {
        scenario_id: scenarioId,
        mode,
        stress_profile_ids: stressProfiles,
        variable_parameters: variables,
        bounds: advancedBounds ? bounds : {},
        routing_strategy: "minimum_hops",
        budget,
        seed,
        algorithm,
        initial_exploration_size: initialSize,
        stop_on_target: false,
        polish: false,
        fixed_failure_profile_id: fixedFailureProfile,
        failure_count: failureCount,
        failure_random_samples: 8,
        failure_correlated_samples: 6,
        cvar_alpha: cvarAlpha,
        adversarial_rounds: adversarialRounds,
        adversarial_search_budget: 40,
        adversarial_cases_per_round: 1,
        adversarial_min_distance: 1,
        outer_restarts: outerRestarts,
        holdout_random_samples: 0,
        holdout_correlated_samples: 0,
      };
      setOptimizerState({ formValues: request });
      const created = await startOptimization(request);
      setOptimizerState({ job: created });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось запустить оптимизацию");
    }
  };

  const running = job && ["queued", "running"].includes(job.status);
  // failure_cvar candidates are scored against a bank of K-satellite-failure
  // cases (case_id like "random-0"), not the fixed Outages/ISL2000 profiles
  // this table's columns assume — building a row for it would silently
  // fall back to "normal worst" for those columns, implying they were
  // checked when they weren't. Its own results card covers that mode.
  const acceptanceExtraRows = result && result.mode !== "failure_cvar" ? [buildAcceptanceRow(result, scenarioId)] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-5 pt-5">
              <section className="flex flex-col gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Режим поиска</h3>
                <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="constrained_robust">Устойчивая конфигурация (рекомендуется)</SelectItem>
                    <SelectItem value="robust_design">Устойчивый поиск 2.0 · условия раздельно</SelectItem>
                    <SelectItem value="normal">Штатный режим</SelectItem>
                    <SelectItem value="robust">Устойчивый поиск без ограничений · экспертный</SelectItem>
                    <SelectItem value="failure_cvar">Failure-Robust (CVaR) · случайные отказы · специализированный</SelectItem>
                  </SelectContent>
                </Select>
                <p className="rounded-md bg-secondary p-3 text-xs leading-relaxed text-muted-foreground">
                  {MODE_EXPLANATIONS[mode]}
                </p>
                {mode !== "normal" && mode !== "failure_cvar" && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Деградированные условия для проверки</p>
                    {Object.entries(PROFILE_LABELS)
                      .filter(([id]) => id !== scenarioId)
                      .map(([id, label]) => (
                        <label key={id} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={profiles.includes(id)} onCheckedChange={() => toggle(profiles, id, setProfiles)} />
                          {label}
                        </label>
                      ))}
                  </div>
                )}
                {mode === "failure_cvar" && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1 text-xs font-medium">
                      Настройки Failure-Robust (CVaR)
                      <HelpTip label="Что такое CVaR">
                        CVaR показывает среднее качество в худшей доле смоделированных сценариев
                        отказа — не среднее по всем сценариям, а именно по самым тяжёлым. Итоговый
                        кандидат дополнительно перепроверяется точным расчётом (Normal, Отказы,
                        ISL2000, N-1, N-2) — CVaR используется только для поиска и ранжирования.
                      </HelpTip>
                    </p>
                    <label className="flex flex-col gap-1 text-xs">
                      Фиксированный банк отказов
                      <Select value={fixedFailureProfile} onValueChange={setFixedFailureProfile}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FAILURE_CVAR_PROFILE_LABELS).map(([id, label]) => (
                            <SelectItem key={id} value={id}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs">
                        Отказов спутников (K)
                        <Input type="number" value={failureCount} onChange={(e) => setFailureCount(Number(e.target.value))} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        CVaR alpha (доля хвоста)
                        <Input type="number" step="0.05" value={cvarAlpha} onChange={(e) => setCvarAlpha(Number(e.target.value))} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        Adversarial-раундов
                        <Input type="number" value={adversarialRounds} onChange={(e) => setAdversarialRounds(Number(e.target.value))} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        Независимых restart
                        <Input type="number" value={outerRestarts} onChange={(e) => setOuterRestarts(Number(e.target.value))} />
                      </label>
                    </div>
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-3 border-t border-border/60 pt-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Параметры плоскостей</h3>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span>Плоскость</span>
                  <span>RAAN</span>
                  <span>Phase</span>
                  {scenario?.design.planes.map((plane) => (
                    <div key={plane.id} className="contents">
                      <strong>{plane.id}</strong>
                      <span className="font-mono">{plane.raan_deg}°</span>
                      <span className="font-mono">{plane.phase_deg}°</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 border-t border-border pt-3">
                  {Object.keys(baselineParameters).map((name) => (
                    <label key={name} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={variables.includes(name)} onCheckedChange={() => toggle(variables, name, setVariables)} />
                      {name}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={advancedBounds} onCheckedChange={(value) => setAdvancedBounds(Boolean(value))} />
                  Задать границы вручную
                </label>
                {advancedBounds &&
                  variables.map((name) => (
                    <div key={name} className="grid grid-cols-[1fr_70px_70px] items-center gap-2 text-xs">
                      <span>{name}</span>
                      <Input
                        type="number"
                        value={bounds[name]?.minimum ?? 0}
                        onChange={(event) =>
                          setBounds({ ...bounds, [name]: { minimum: Number(event.target.value), maximum: bounds[name]?.maximum ?? 360 } })
                        }
                      />
                      <Input
                        type="number"
                        value={bounds[name]?.maximum ?? 360}
                        onChange={(event) =>
                          setBounds({ ...bounds, [name]: { minimum: bounds[name]?.minimum ?? 0, maximum: Number(event.target.value) } })
                        }
                      />
                    </div>
                  ))}
              </section>

              <section className="flex flex-col gap-3 border-t border-border/60 pt-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Настройки поиска</h3>
                <Select value={String(budget)} onValueChange={(value) => setBudget(Number(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[100, 250, 500].map((value) => (
                      <SelectItem key={value} value={String(value)}>Бюджет: {value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="space-y-1 text-xs font-medium">Начальное число генератора
                  <Input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} aria-label="Начальное число генератора случайных чисел" />
                </label>
                <Select value={algorithm} onValueChange={(value) => setAlgorithm(value as typeof algorithm)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="differential_evolution">Differential Evolution</SelectItem>
                    <SelectItem value="toroidal_differential_evolution">Toroidal DE · для циклических углов у границы 0/360°</SelectItem>
                    <SelectItem value="random">Random benchmark</SelectItem>
                    <SelectItem value="catboost">CatBoost · обучение в ходе поиска · Research</SelectItem>
                    <SelectItem value="catboost_pretrained">CatBoost · сохранённая модель · быстрый поиск · Research</SelectItem>
                  </SelectContent>
                </Select>
                {algorithm === "catboost_pretrained" && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Research/Experimental.</span> Без
                    переобучения: прогноз для 8192 вариантов, до 16 точных расчётов и повторная
                    проверка top-5. Требуется совместимая сохранённая модель. Поддерживается только
                    штатный режим (normal), полная группировка и маршрутизация minimum_hops. Модель
                    только ранжирует кандидатов — итоговые метрики всегда из точного расчёта; см.{" "}
                    <Link href="/research" className="text-primary hover:underline">ML Surrogate Research</Link>.
                  </p>
                )}
                {algorithm === "catboost" && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Research/Experimental.</span>{" "}
                    CatBoost обучается на точных расчётах текущего запуска и переобучается каждые 8
                    кандидатов. Начальная выборка — минимум 32 кандидата; каждый предложенный
                    вариант проверяется точным симулятором, а не прогнозом.
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Дополнительные параметры</summary>
                  <label className="mt-2 block text-xs">
                    Кандидатов в начальной выборке
                    <Input className="mt-1" type="number" value={initialSize} onChange={(event) => setInitialSize(Number(event.target.value))} />
                  </label>
                </details>
                <Button onClick={start} disabled={!scenario || variables.length === 0 || (mode !== "normal" && mode !== "failure_cvar" && profiles.length === 0) || Boolean(running)}>
                  {running ? <Loader2 className="animate-spin" /> : <Play />}
                  {running ? "Расчёт..." : "Запустить оптимизацию"}
                </Button>
              </section>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <AcceptanceMatrix extraRows={acceptanceExtraRows} />

          {error && <p className="rounded-md border border-status-bad/40 p-3 text-status-bad">{error}</p>}
          {running && job && (
            <Card>
              <CardHeader><CardTitle>Точный расчёт выполняется</CardTitle></CardHeader>
              <CardContent>
                <JobProgress
                  primaryLabel="Проверено кандидатов"
                  secondaryLabel={`лучший worst: ${job.best_worst_availability == null ? "—" : pct(job.best_worst_availability)}`}
                  evaluated={job.evaluated}
                  total={job.budget}
                />
              </CardContent>
            </Card>
          )}
          {!job && (
            <EmptyState
              icon={SlidersHorizontal}
              title="Поиск ещё не запущен"
              description="Выберите режим и допустимые параметры слева. Базовый и итоговый варианты будут проверены одним и тем же точным расчётным ядром."
            />
          )}
          {result && (
            <>
              <Card className="ring-1 ring-primary/40">
                <CardHeader><CardTitle>Рекомендованная конфигурация</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">Доступность худшего пункта</p>
                      <p className="font-mono text-3xl font-semibold tabular-nums">
                        {pct(result.best.aggregates.worst_availability)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">Изменение к базовому варианту</p>
                      <p
                        className={`font-mono text-lg font-semibold tabular-nums ${result.best.aggregates.worst_availability >= result.baseline.aggregates.worst_availability ? "text-status-ok" : "text-status-bad"}`}
                      >
                        {result.best.aggregates.worst_availability >= result.baseline.aggregates.worst_availability ? "+" : ""}
                        {((result.best.aggregates.worst_availability - result.baseline.aggregates.worst_availability) * 100).toFixed(2)} пп
                      </p>
                    </div>
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${result.best.aggregates.target_feasible ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Target {result.best.aggregates.target_feasible ? "PASS" : "FAIL"}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{result.recommendation}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div />
                    <div className="text-xs uppercase text-muted-foreground">Базовый вариант</div>
                    <div className="text-xs uppercase text-muted-foreground">Рекомендовано</div>
                    {result.baseline.scenarios[0].clients.map((client) => {
                      const optimized = result.best.scenarios[0].clients.find((item) => item.client_id === client.client_id);
                      return (
                        <div className="contents" key={client.client_id}>
                          <strong>{client.client_id}</strong>
                          <span className="font-mono">{pct(client.availability)}</span>
                          <span className="font-mono text-primary">{optimized ? pct(optimized.availability) : "—"}</span>
                        </div>
                      );
                    })}
                    <strong>Худший пункт</strong>
                    <span className="font-mono">{pct(result.baseline.aggregates.worst_availability)}</span>
                    <span className="font-mono text-primary">{pct(result.best.aggregates.worst_availability)}</span>
                  </div>
                  <Button variant="outline" onClick={() => { setUploadedScenario(result.derived_scenario); router.push("/"); }}>
                    Открыть в моделировании
                  </Button>
                </CardContent>
              </Card>

              {result.mode === "failure_cvar" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-1.5">
                      Failure-Robust (CVaR) · банк отказов
                      <HelpTip label="Что показывает эта карточка">
                        CVaR — среднее качество в худшей доле банка (не среднее по всему банку).
                        Показанные Normal/worst-availability числа — точные значения того же
                        расчётного ядра, что и везде в проекте, не производные от CVaR.
                      </HelpTip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">Размер банка / K</p>
                        <p className="font-mono text-lg font-semibold">
                          {result.best.failure_robust?.bank_size ?? "—"} / {failureCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">CVaR (alpha={result.cvar_alpha ?? cvarAlpha})</p>
                        <p className="font-mono text-lg font-semibold">
                          {result.best.failure_robust ? pct(result.best.failure_robust.cvar_availability) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">Худший случай банка</p>
                        <p className="font-mono text-lg font-semibold">
                          {result.best.failure_robust ? pct(result.best.failure_robust.worst_availability) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">Штатный worst</p>
                        <p className="font-mono text-lg font-semibold">
                          {result.best.failure_robust ? pct(result.best.failure_robust.normal_worst_availability) : "—"}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Seed {seed} · restart {outerRestarts} · adversarial-раундов {adversarialRounds} ·
                      окно отказа {result.failure_start_s ?? "—"}–{result.failure_end_s ?? "—"} с
                    </p>
                    {result.holdout_validation && (
                      <div className="rounded-md bg-secondary p-3 text-xs">
                        <p className="font-medium">Holdout-проверка (независимый банк, {result.holdout_validation.bank_size} наборов, seed {result.holdout_validation.seed})</p>
                        <p className="mt-1 text-muted-foreground">
                          CVaR на обучающем банке {result.best.failure_robust ? pct(result.best.failure_robust.cvar_availability) : "—"} →
                          на holdout {pct(result.holdout_validation.best.cvar_availability)}
                          (baseline на holdout: {pct(result.holdout_validation.baseline.cvar_availability)}),
                          generalization gap {(result.holdout_validation.generalization_gap * 100).toFixed(2)} пп.
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Это специализированный кандидат для устойчивости к случайным множественным
                      отказам — он не заменяет основной Recommended Robust автоматически. Сравните
                      Normal/Отказы/ISL2000/N-1/N-2 в «Инженерная сводка», прежде чем менять
                      рекомендацию.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle>Матрица условий</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span>Сценарий</span><span>База · худший</span><span>Оптимизация · худший</span>
                    {result.baseline.scenarios.map((row) => (
                      <div key={row.profile} className="contents">
                        <span>{PROFILE_LABELS[row.profile] ?? row.profile}</span>
                        <span className="font-mono">{pct(row.worst_availability)}</span>
                        <span className="font-mono">
                          {pct(result.best.scenarios.find((item) => item.profile === row.profile)?.worst_availability ?? 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Изменения параметров</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th>Параметр</th><th>Базовый</th><th>Оптимизированный</th><th>Изменение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variables.map((name) => {
                        const delta = angleDelta(result.best.parameters[name], result.baseline.parameters[name]);
                        return (
                          <tr key={name} className="border-t border-border">
                            <td className="py-2">{name}</td>
                            <td>{result.baseline.parameters[name].toFixed(2)}°</td>
                            <td>{result.best.parameters[name].toFixed(2)}°</td>
                            <td>{delta > 0 ? "+" : ""}{delta.toFixed(2)}°</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Сходимость</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={result.convergence}>
                          <CartesianGrid strokeOpacity={0.15} />
                          <XAxis dataKey="evaluation" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                          <Tooltip formatter={(value) => pct(Number(value))} />
                          <Line type="stepAfter" dataKey="best_worst_availability" stroke="var(--color-chart-1)" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Распределение кандидатов</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart>
                          <CartesianGrid strokeOpacity={0.15} />
                          <XAxis dataKey="evaluation" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="worst" domain={[0, 1]} tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                          <Tooltip formatter={(value) => pct(Number(value))} />
                          <Scatter fill="var(--color-chart-2)" data={result.dataset.map((item, index) => ({ evaluation: item.evaluation ?? index + 1, worst: item.aggregates.worst_availability }))} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {result.pareto_front.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Парето-фронт ({result.pareto_front.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <p className="mb-2 text-xs text-muted-foreground">
                      Кандидаты, которых не превосходит ни один другой одновременно по всем целям
                      (target-нарушения, worst/mean availability, худший перерыв) — настоящий
                      Парето-фронт, не top-N по одному числу.
                    </p>
                    <table className="w-full min-w-[600px] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th>Худший пункт</th><th>Среднее</th><th>Худший перерыв</th><th>Нарушений цели</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.pareto_front.map((candidate, index) => (
                          <tr key={index} className="border-t border-border">
                            <td className="py-1.5 font-mono">{pct(candidate.aggregates.worst_availability)}</td>
                            <td className="font-mono">{pct(candidate.aggregates.mean_availability)}</td>
                            <td className="font-mono">{Math.round(candidate.aggregates.worst_max_outage_s / 60)} мин</td>
                            <td className="font-mono">{candidate.aggregates.target_violations}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle>Лучшие найденные варианты</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th>Rank</th><th>Worst</th><th>Worst outage</th>
                        {variables.map((name) => <th key={name}>{name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.top_candidates.map((candidate, index) => (
                        <tr key={index} className="border-t border-border">
                          <td className="py-2">{index + 1}</td>
                          <td>{pct(candidate.aggregates.worst_availability)}</td>
                          <td>{Math.round(candidate.aggregates.worst_max_outage_s / 60)} мин</td>
                          {variables.map((name) => (
                            <td key={name} className="font-mono">{candidate.parameters[name]?.toFixed(2) ?? "—"}°</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {result.evaluated} кандидатов · {result.cache.exact_evaluations} exact · cache {result.cache.hits} hits / {result.cache.misses} misses · {result.runtime_s.toFixed(1)} с · top-{result.revalidated_candidates} revalidated
                    {Boolean(result.surrogate_fits) && ` · обучений CatBoost: ${result.surrogate_fits}`}
                    {result.pretrained_model_id && ` · модель: ${result.pretrained_model_id} · прогнозов: ${result.surrogate_predictions} · без переобучения`}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
