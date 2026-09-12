"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, type LucideIcon, Radio, Route, ShieldAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { AcceptanceMatrix } from "@/components/optimizer/acceptance-matrix";
import { DeploymentSizeRecommendation } from "@/components/summary/deployment-size-recommendation";
import { RobustDesignHighlight } from "@/components/summary/robust-design-highlight";
import { StaleRunNotice } from "@/components/simulation/stale-run-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSimulationRun } from "@/hooks/use-simulation-run";
import type { AcceptanceRow } from "@/lib/acceptance-reference";
import { getExample } from "@/lib/api/scenarios";
import { formatDuration, formatPercent } from "@/lib/format";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";

const STRATEGY_LABELS: Record<string, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
  maximum_margin: "Максимальный запас",
  maximum_persistence: "Максимальная стабильность",
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ok ? "bg-status-ok/10 text-status-ok" : "bg-status-bad/10 text-status-bad"}`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

type ChipStatus = "pass" | "fail" | "info" | "unknown";

const CHIP_TONE: Record<ChipStatus, string> = {
  pass: "border-status-ok/30 bg-status-ok/5",
  fail: "border-status-bad/30 bg-status-bad/5",
  info: "border-border bg-secondary/40",
  unknown: "border-border/60 bg-secondary/20",
};

function ResilienceStatusChip({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  status: ChipStatus;
  detail: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${CHIP_TONE[status]}`}>
      <Icon
        className={`h-4 w-4 shrink-0 ${status === "pass" ? "text-status-ok" : status === "fail" ? "text-status-bad" : "text-muted-foreground"}`}
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">
          {label}
          {status === "pass" && <span className="ml-1.5 text-status-ok">пройдено</span>}
          {status === "fail" && <span className="ml-1.5 text-status-bad">не пройдено</span>}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function NotRunNote({ href, label }: { href: string; label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      Не запущено. <Link href={href} className="text-primary hover:underline">{label}</Link>
    </p>
  );
}

export function SummaryWorkspace() {
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const uploadedScenario = useAppStore((s) => s.uploadedScenario);
  const selectedScenarioId = useAppStore((s) => s.selectedScenarioId);
  const routingStrategy = useAppStore((s) => s.routingStrategy);
  const resilienceResults = useAppStore((s) => s.resilienceResults);
  const optimizer = useAppStore((s) => s.optimizer);
  const { data: run, isLoading, isError } = useSimulationRun(selectedRunId);
  const { data: scenario } = useQuery({
    queryKey: ["summary-scenario", run?.scenario_id ?? selectedScenarioId],
    queryFn: () => getExample(run?.scenario_id ?? selectedScenarioId),
    enabled: !uploadedScenario,
  });
  const satelliteCount = uploadedScenario?.design.satellites.length ?? scenario?.design.satellites.length;

  const clientEntries = useMemo(() => (run ? Object.entries(run.metrics) : []), [run]);
  const worstClient = useMemo(() => {
    if (clientEntries.length === 0) return null;
    return clientEntries.reduce((worst, current) =>
      current[1].availability_percent < worst[1].availability_percent ? current : worst
    );
  }, [clientEntries]);
  const allTargetsAchieved = clientEntries.length > 0 && clientEntries.every(([, m]) => m.target_achieved);
  const worstOutageS = clientEntries.length > 0 ? Math.max(...clientEntries.map(([, m]) => m.max_outage_s)) : null;
  const targetMarginPp = worstClient
    ? worstClient[1].availability_percent - worstClient[1].target_availability * 100
    : null;

  const acceptanceExtraRows: AcceptanceRow[] = optimizer.result
    ? [
        {
          name: "Текущий результат оптимизации",
          source: `mode=${optimizer.result.mode}`,
          normalWorstPercent: optimizer.result.best.aggregates.worst_availability * 100,
          outagesWorstPercent: optimizer.result.best.aggregates.worst_availability * 100,
          isl2000WorstPercent: optimizer.result.best.aggregates.worst_availability * 100,
          n1Status: "info",
          n2Status: "info",
          worstMaxOutageS: optimizer.result.best.aggregates.worst_max_outage_s,
          targetNormal: optimizer.result.best.aggregates.target_feasible ? "pass" : "fail",
          targetDegraded: "info",
        },
      ]
    : [];

  const recommendation = buildRecommendation({
    hasRun: Boolean(run),
    allTargetsAchieved,
    worstClientId: worstClient?.[0] ?? null,
    worstClientPercent: worstClient?.[1].availability_percent ?? null,
    monteCarloRecommended: resilienceResults.monteCarlo?.recommended_strategy ?? null,
    n2ThresholdFound: resilienceResults.threshold?.threshold_found ?? null,
    n2ThresholdLabel: resilienceResults.threshold?.threshold_label ?? null,
    optimizerFeasible: optimizer.result?.best.aggregates.target_feasible ?? null,
    optimizerWorstPercent: optimizer.result ? optimizer.result.best.aggregates.worst_availability * 100 : null,
  });

  return (
    <div className="flex flex-col gap-4">
      <StaleRunNotice />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="text-text-muted">Сценарий/вариант: </span>
          <span className="font-medium text-foreground">
            {uploadedScenario
              ? uploadedScenario.meta.id
              : run?.scenario_title
                ? scenarioDisplayTitle(run.scenario_id ?? "", run.scenario_title)
                : "не выбран"}
          </span>
        </span>
        <span>
          <span className="text-text-muted">Стратегия: </span>
          <span className="font-medium text-foreground">{STRATEGY_LABELS[routingStrategy] ?? routingStrategy}</span>
        </span>
        {run && (
          <span>
            <span className="text-text-muted">Расчёт: </span>
            <span className="font-medium text-foreground">{run.n_steps} шагов, {run.client_ids.length} клиента</span>
          </span>
        )}
      </div>

      {run && worstClient && (
        <Card className="ring-1 ring-primary/25">
          <CardContent className="flex flex-col gap-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-4xl font-semibold tabular-nums text-foreground">
                {formatPercent(worstClient[1].availability_percent)}
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Худшая доступность</p>
                <StatusPill ok={allTargetsAchieved} label={allTargetsAchieved ? "TARGET PASS" : "TARGET FAIL"} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm sm:flex sm:gap-8">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Запас к target</p>
                <p className={`font-mono font-semibold tabular-nums ${(targetMarginPp ?? 0) >= 0 ? "text-status-ok" : "text-status-bad"}`}>
                  {targetMarginPp != null ? `${targetMarginPp >= 0 ? "+" : ""}${targetMarginPp.toFixed(2)} пп` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Худший перерыв</p>
                <p className="font-mono font-semibold tabular-nums">
                  {worstOutageS != null ? formatDuration(worstOutageS) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Спутников</p>
                <p className="font-mono font-semibold tabular-nums">{satelliteCount ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {run && (
        <div className="grid gap-3 sm:grid-cols-3">
          <ResilienceStatusChip
            icon={ShieldAlert}
            label="N-1"
            status={
              resilienceResults.criticality
                ? (resilienceResults.criticality.ranking[0]?.target_violations_count ?? 0) > 0
                  ? "fail"
                  : "pass"
                : "unknown"
            }
            detail={resilienceResults.criticality ? resilienceResults.criticality.recommendation : "не запущено"}
          />
          <ResilienceStatusChip
            icon={Radio}
            label="N-2"
            status={
              resilienceResults.threshold
                ? resilienceResults.threshold.target_breaking_pairs_count > 0
                  ? "fail"
                  : "pass"
                : "unknown"
            }
            detail={
              resilienceResults.threshold
                ? `порог: ${resilienceResults.threshold.threshold_label} отказов`
                : "не запущено"
            }
          />
          <ResilienceStatusChip
            icon={Route}
            label="Резервирование"
            status={resilienceResults.redundancy ? "info" : "unknown"}
            detail={
              resilienceResults.redundancy
                ? `${Object.keys(resilienceResults.redundancy.clients).length} клиента проверено`
                : "не запущено"
            }
          />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-6 text-sm text-status-bad">
            Сохранённый run_id больше не найден на сервере (например, backend был перезапущен).
            Запустите расчёт заново на странице «Моделирование».
          </CardContent>
        </Card>
      )}

      {!run && !isLoading && !isError && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Расчёт ещё не запускался. <Link href="/" className="text-primary hover:underline">Перейти к моделированию</Link>.
          </CardContent>
        </Card>
      )}

      {run && (
        <Card>
          <CardHeader><CardTitle>Метрики по клиентам</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-2 font-medium">Пункт</th>
                  <th className="px-2 py-2 text-right font-medium">Доступность</th>
                  <th className="px-2 py-2 text-right font-medium">Видимость</th>
                  <th className="px-2 py-2 text-right font-medium">Макс. перерыв</th>
                  <th className="px-2 py-2 text-right font-medium">Смен маршрута</th>
                  <th className="py-2 pl-2 text-right font-medium">Цель</th>
                </tr>
              </thead>
              <tbody>
                {clientEntries.map(([id, m]) => (
                  <tr key={id} className={`border-b border-border/60 ${worstClient?.[0] === id ? "bg-status-bad/5" : ""}`}>
                    <td className="py-2 pr-2 font-mono font-medium text-foreground">
                      {id} {worstClient?.[0] === id && <Badge variant="outline" className="ml-1 text-[10px]">худший</Badge>}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{formatPercent(m.availability_percent)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{formatPercent(m.visibility_percent)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatDuration(m.max_outage_s)}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {m.outage_count} событий · медиана {formatDuration(m.outage_quality.median_outage_s)} · P95{" "}
                        {formatDuration(m.outage_quality.p95_outage_s)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{m.route_change_count}</td>
                    <td className="py-2 pl-2 text-right">
                      {m.target_achieved ? (
                        <CheckCircle2 className="ml-auto h-4 w-4 text-status-ok" />
                      ) : (
                        <XCircle className="ml-auto h-4 w-4 text-status-bad" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Устойчивость</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {resilienceResults.monteCarlo ? (
              <p>
                Monte Carlo: рекомендована <strong>{STRATEGY_LABELS[resilienceResults.monteCarlo.recommended_strategy]}</strong>
              </p>
            ) : (
              <NotRunNote href="/resilience" label="Запустить Monte Carlo" />
            )}
            {resilienceResults.criticality ? (
              <p>N-1: {resilienceResults.criticality.recommendation}</p>
            ) : (
              <NotRunNote href="/resilience" label="Запустить N-1" />
            )}
            {resilienceResults.threshold ? (
              <p>
                N-2: порог отказоустойчивости — <strong>{resilienceResults.threshold.threshold_label}</strong> отказов
                {resilienceResults.threshold.target_breaking_pairs_count > 0 && (
                  <span className="text-status-warn"> ({resilienceResults.threshold.target_breaking_pairs_count} пар нарушают target)</span>
                )}
              </p>
            ) : (
              <NotRunNote href="/resilience" label="Запустить N-2" />
            )}
            {resilienceResults.routing ? (
              <p>
                Маршрутизация: рекомендована <strong>{STRATEGY_LABELS[resilienceResults.routing.recommended_strategy]}</strong>
              </p>
            ) : (
              <NotRunNote href="/resilience" label="Сравнить стратегии" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Оптимизация</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {optimizer.result ? (
              <>
                <p>
                  Режим <strong>{optimizer.result.mode}</strong>: worst {formatPercent(optimizer.result.best.aggregates.worst_availability * 100)}
                </p>
                <p className="text-muted-foreground">{optimizer.result.recommendation}</p>
                <Button asChild size="sm" variant="outline" className="w-fit">
                  <Link href="/optimizer">Открыть оптимизатор</Link>
                </Button>
              </>
            ) : (
              <NotRunNote href="/optimizer" label="Запустить оптимизацию" />
            )}
          </CardContent>
        </Card>
      </div>

      <RobustDesignHighlight />

      <DeploymentSizeRecommendation />

      <AcceptanceMatrix extraRows={acceptanceExtraRows} />

      <Card className="ring-1 ring-primary/40">
        <CardHeader><CardTitle>Инженерная рекомендация</CardTitle></CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{recommendation}</p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm"><Link href="/">Моделирование</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/compare">Сравнить</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/optimizer">Оптимизировать</Link></Button>
      </div>
    </div>
  );
}

function buildRecommendation(input: {
  hasRun: boolean;
  allTargetsAchieved: boolean;
  worstClientId: string | null;
  worstClientPercent: number | null;
  monteCarloRecommended: string | null;
  n2ThresholdFound: boolean | null;
  n2ThresholdLabel: string | null;
  optimizerFeasible: boolean | null;
  optimizerWorstPercent: number | null;
}): string {
  const lines: string[] = [];

  if (!input.hasRun) {
    return "Расчёт ещё не выполнялся — запустите моделирование, чтобы получить рекомендацию на основе фактических метрик.";
  }

  lines.push(
    input.allTargetsAchieved
      ? "Базовый вариант: текущая конфигурация достигает цели ≥90% для всех наземных пунктов в штатном режиме."
      : `Базовый вариант: цель ≥90% не достигнута — худший пункт ${input.worstClientId} имеет ${input.worstClientPercent?.toFixed(2)}%.`
  );

  if (input.n2ThresholdFound !== null) {
    lines.push(
      input.n2ThresholdFound
        ? `Устойчивость: найден порог отказоустойчивости — ${input.n2ThresholdLabel} отказов уже нарушают target.`
        : "Устойчивость: в проверенном диапазоне N-1/N-2 отказов target не нарушается ни разу — топология структурно устойчива к потере 1-2 аппаратов."
    );
  }

  if (input.optimizerWorstPercent !== null) {
    lines.push(
      input.optimizerFeasible
        ? `Оптимизация: найдена конфигурация с доступностью худшего пункта ${input.optimizerWorstPercent.toFixed(2)}%, достигающая цели.`
        : `Оптимизация: лучшая конфигурация даёт ${input.optimizerWorstPercent.toFixed(2)}% для худшего пункта — цель не достигнута в исследованном пространстве RAAN и фаз.`
    );
  }

  if (input.monteCarloRecommended) {
    lines.push(`Устойчивость к случайным отказам: рекомендованная стратегия маршрутизации — ${input.monteCarloRecommended}.`);
  }

  return lines.join("\n");
}
