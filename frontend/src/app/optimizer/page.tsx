"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { AboutDialog } from "@/components/layout/about-dialog";
import { BackendStatus } from "@/components/layout/backend-status";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getExample } from "@/lib/api/scenarios";
import { getOptimizationResult, getOptimizationStatus, startOptimization } from "@/lib/api/optimization";
import { useAppStore } from "@/store/app-store";
import type { OptimizationJob, OptimizationResult } from "@/types/optimization";

const DEFAULT_PARAMETERS = ["P2.raan_deg", "P3.raan_deg", "P2.phase_deg", "P3.phase_deg"];
const PROFILE_LABELS: Record<string, string> = {
  "01_full_constellation": "Нормальная работа",
  "03_satellite_outages": "Отказы 10 аппаратов",
  "04_link_range": "ISL 2000 км",
};

function pct(value: number) {
  return `${(value * 100).toFixed(2).replace(".", ",")} %`;
}

function angleDelta(value: number, baseline: number) {
  return ((value - baseline + 540) % 360) - 180;
}

export default function OptimizerPage() {
  const router = useRouter();
  const scenarioId = useAppStore((state) => state.selectedScenarioId);
  const setUploadedScenario = useAppStore((state) => state.setUploadedScenario);
  const { data: scenario } = useQuery({ queryKey: ["optimizer-scenario", scenarioId], queryFn: () => getExample(scenarioId) });
  const [mode, setMode] = useState<"normal" | "robust">("normal");
  const [variables, setVariables] = useState(DEFAULT_PARAMETERS);
  const [profiles, setProfiles] = useState(Object.keys(PROFILE_LABELS));
  const [budget, setBudget] = useState(100);
  const [seed, setSeed] = useState(42);
  const [algorithm, setAlgorithm] = useState<"random" | "differential_evolution">("differential_evolution");
  const [initialSize, setInitialSize] = useState(16);
  const [advancedBounds, setAdvancedBounds] = useState(false);
  const [bounds, setBounds] = useState<Record<string, { minimum: number; maximum: number }>>({});
  const [job, setJob] = useState<OptimizationJob | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await getOptimizationStatus(job.run_id);
        setJob(status);
        if (status.status === "completed") setResult(await getOptimizationResult(status.run_id));
        if (status.status === "failed") setError(status.error ?? "Расчёт завершился с ошибкой");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Ошибка API");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [job]);

  const baselineParameters = useMemo(() => Object.fromEntries((scenario?.design.planes ?? []).flatMap((plane) => [
    [`${plane.id}.raan_deg`, plane.raan_deg],
    [`${plane.id}.phase_deg`, plane.phase_deg],
  ])), [scenario]);

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) =>
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const start = async () => {
    setError(null);
    setResult(null);
    try {
      const created = await startOptimization({
        scenario_id: scenarioId,
        mode,
        stress_profile_ids: profiles,
        variable_parameters: variables,
        bounds: advancedBounds ? bounds : {},
        routing_strategy: "minimum_hops",
        budget,
        seed,
        algorithm,
        initial_exploration_size: initialSize,
        stop_on_target: false,
        polish: false,
      });
      setJob(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось запустить оптимизацию");
    }
  };

  return <div className="min-h-screen bg-workspace">
    <div className="border-b border-border bg-background"><header className="flex h-16 items-center gap-4 px-4"><div><h1 className="text-[15px] font-semibold">NORD-48</h1><p className="text-[11px] text-muted-foreground">Configuration Design</p></div><AboutDialog /><div className="ml-auto"><BackendStatus /></div></header></div>
    <WorkspaceNav />
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <div><h2 className="text-xl font-semibold">Оптимизация конфигурации</h2><p className="text-sm text-muted-foreground">Поиск параметров орбитальных плоскостей для повышения доступности и устойчивости сети.</p></div>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-4">
          <Card><CardHeader><CardTitle>Условия поиска</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Нормальный режим</SelectItem><SelectItem value="robust">Устойчивая конфигурация</SelectItem></SelectContent></Select>
            <p className="rounded-md bg-secondary p-3 text-xs text-muted-foreground">{mode === "normal" ? "Максимизировать доступность худшего наземного пункта." : "Максимизировать худшую доступность по всем выбранным условиям."}</p>
            {mode === "robust" && <div className="space-y-2"><p className="text-xs font-medium">Stress profiles</p>{Object.entries(PROFILE_LABELS).map(([id, label]) => <label key={id} className="flex items-center gap-2 text-sm"><Checkbox checked={profiles.includes(id)} onCheckedChange={() => toggle(profiles, id, setProfiles)} />{label}</label>)}</div>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Параметры плоскостей</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>Плоскость</span><span>RAAN</span><span>Phase</span>{scenario?.design.planes.map((plane) => <div key={plane.id} className="contents"><strong>{plane.id}</strong><span className="font-mono">{plane.raan_deg}°</span><span className="font-mono">{plane.phase_deg}°</span></div>)}</div>
            <div className="space-y-2 border-t border-border pt-3">{Object.keys(baselineParameters).map((name) => <label key={name} className="flex items-center gap-2 text-xs"><Checkbox checked={variables.includes(name)} onCheckedChange={() => toggle(variables, name, setVariables)} />{name}</label>)}</div>
            <label className="flex items-center gap-2 text-xs"><Checkbox checked={advancedBounds} onCheckedChange={(value) => setAdvancedBounds(Boolean(value))} />Расширенные границы</label>
            {advancedBounds && variables.map((name) => <div key={name} className="grid grid-cols-[1fr_70px_70px] items-center gap-2 text-xs"><span>{name}</span><Input type="number" value={bounds[name]?.minimum ?? 0} onChange={(event) => setBounds({ ...bounds, [name]: { minimum: Number(event.target.value), maximum: bounds[name]?.maximum ?? 360 } })} /><Input type="number" value={bounds[name]?.maximum ?? 360} onChange={(event) => setBounds({ ...bounds, [name]: { minimum: bounds[name]?.minimum ?? 0, maximum: Number(event.target.value) } })} /></div>)}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Настройки поиска</CardTitle></CardHeader><CardContent className="grid gap-3">
            <Select value={String(budget)} onValueChange={(value) => setBudget(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[100, 250, 500].map((value) => <SelectItem key={value} value={String(value)}>Бюджет: {value}</SelectItem>)}</SelectContent></Select>
            <Input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} aria-label="Seed" />
            <Select value={algorithm} onValueChange={(value) => setAlgorithm(value as typeof algorithm)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="differential_evolution">Differential Evolution</SelectItem><SelectItem value="random">Random benchmark</SelectItem></SelectContent></Select>
            <details><summary className="cursor-pointer text-xs text-muted-foreground">Advanced</summary><label className="mt-2 block text-xs">Initial exploration<Input className="mt-1" type="number" value={initialSize} onChange={(event) => setInitialSize(Number(event.target.value))} /></label></details>
            <Button onClick={start} disabled={!scenario || variables.length === 0 || (mode === "robust" && profiles.length === 0) || Boolean(job && ["queued", "running"].includes(job.status))}>{job && ["queued", "running"].includes(job.status) ? <Loader2 className="animate-spin" /> : <Play />}{job && ["queued", "running"].includes(job.status) ? "Расчёт..." : "Запустить оптимизацию"}</Button>
          </CardContent></Card>
        </div>
        <div className="flex flex-col gap-4">
          {error && <p className="rounded-md border border-status-bad/40 p-3 text-status-bad">{error}</p>}
          {job && !result && <Card><CardHeader><CardTitle>Точный расчёт выполняется</CardTitle></CardHeader><CardContent><div className="flex justify-between text-sm"><span>Проверено: <strong className="font-mono">{job.evaluated} / {job.budget}</strong></span><span>Лучший worst: <strong className="font-mono">{job.best_worst_availability == null ? "—" : pct(job.best_worst_availability)}</strong></span></div><div className="mt-3 h-2 overflow-hidden rounded bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${job.budget ? job.evaluated / job.budget * 100 : 0}%` }} /></div></CardContent></Card>}
          {!job && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Выберите режим и допустимые параметры. Baseline будет рассчитан первым тем же exact simulator.</CardContent></Card>}
          {result && <>
            <Card><CardHeader><CardTitle>Baseline vs Optimized</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-3 gap-3"><div /><div className="text-xs uppercase text-muted-foreground">Baseline</div><div className="text-xs uppercase text-muted-foreground">Optimized</div>{result.baseline.scenarios[0].clients.map((client) => { const optimized = result.best.scenarios[0].clients.find((item) => item.client_id === client.client_id); return <div className="contents" key={client.client_id}><strong>{client.client_id}</strong><span className="font-mono">{pct(client.availability)}</span><span className="font-mono text-primary">{optimized ? pct(optimized.availability) : "—"}</span></div>; })}<strong>Worst</strong><span className="font-mono">{pct(result.baseline.aggregates.worst_availability)}</span><span className="font-mono text-primary">{pct(result.best.aggregates.worst_availability)}</span></div><div className={`rounded-md p-3 text-sm ${result.best.aggregates.target_feasible ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}><CheckCircle2 className="mr-2 inline h-4 w-4" />Target ≥ 90%: baseline {result.baseline.aggregates.conditions - result.baseline.aggregates.target_violations} / {result.baseline.aggregates.conditions} · optimized {result.best.aggregates.conditions - result.best.aggregates.target_violations} / {result.best.aggregates.conditions}</div><p className="text-sm text-muted-foreground">{result.recommendation}</p><Button variant="outline" onClick={() => { setUploadedScenario(result.derived_scenario); router.push("/"); }}>Открыть в моделировании</Button></CardContent></Card>
            <Card><CardHeader><CardTitle>Матрица условий</CardTitle></CardHeader><CardContent><div className="grid grid-cols-3 gap-2 text-sm"><span>Сценарий</span><span>Baseline worst</span><span>Optimized worst</span>{result.baseline.scenarios.map((row) => <div key={row.profile} className="contents"><span>{PROFILE_LABELS[row.profile] ?? row.profile}</span><span className="font-mono">{pct(row.worst_availability)}</span><span className="font-mono">{pct(result.best.scenarios.find((item) => item.profile === row.profile)?.worst_availability ?? 0)}</span></div>)}</div></CardContent></Card>
            <Card><CardHeader><CardTitle>Изменения параметров</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Параметр</th><th>Baseline</th><th>Optimized</th><th>Δ</th></tr></thead><tbody>{variables.map((name) => { const delta = angleDelta(result.best.parameters[name], result.baseline.parameters[name]); return <tr key={name} className="border-t border-border"><td className="py-2">{name}</td><td>{result.baseline.parameters[name].toFixed(2)}°</td><td>{result.best.parameters[name].toFixed(2)}°</td><td>{delta > 0 ? "+" : ""}{delta.toFixed(2)}°</td></tr>; })}</tbody></table></CardContent></Card>
            <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Сходимость</CardTitle></CardHeader><CardContent><LineChart width={430} height={220} data={result.convergence}><CartesianGrid strokeOpacity={0.15} /><XAxis dataKey="evaluation" /><YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} /><Tooltip formatter={(value) => pct(Number(value))} /><Line type="stepAfter" dataKey="best_worst_availability" stroke="#43a9df" dot={false} /></LineChart></CardContent></Card><Card><CardHeader><CardTitle>Распределение кандидатов</CardTitle></CardHeader><CardContent><ScatterChart width={430} height={220}><CartesianGrid strokeOpacity={0.15} /><XAxis dataKey="evaluation" /><YAxis dataKey="worst" domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} /><Tooltip formatter={(value) => pct(Number(value))} /><Scatter fill="#62c6f2" data={result.dataset.map((item, index) => ({ evaluation: item.evaluation ?? index + 1, worst: item.aggregates.worst_availability }))} /></ScatterChart></CardContent></Card></div>
            <Card><CardHeader><CardTitle>Лучшие найденные варианты</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Rank</th><th>Worst</th><th>Worst outage</th>{DEFAULT_PARAMETERS.map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{result.top_candidates.map((candidate, index) => <tr key={index} className="border-t border-border"><td className="py-2">{index + 1}</td><td>{pct(candidate.aggregates.worst_availability)}</td><td>{candidate.aggregates.worst_max_outage_s / 60} мин</td>{DEFAULT_PARAMETERS.map((name) => <td key={name} className="font-mono">{candidate.parameters[name].toFixed(2)}°</td>)}</tr>)}</tbody></table><p className="mt-3 text-xs text-muted-foreground">{result.evaluated} кандидатов · {result.cache.exact_evaluations} exact · cache {result.cache.hits} hits / {result.cache.misses} misses · {result.runtime_s.toFixed(1)} с · top-{result.revalidated_candidates} revalidated</p></CardContent></Card>
          </>}
        </div>
      </div>
    </main>
  </div>;
}
