"use client";

import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EngineeringInfo } from "@/components/ui/engineering-info";
import { REFERENCE_ACCEPTANCE_ROWS } from "@/lib/acceptance-reference";
import { formatDuration, formatPercent } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { ClientMetrics } from "@/types/simulation";

/** One glance at the resilience posture of the currently loaded run —
 * every value here is read from state already fetched elsewhere on the
 * app (N-1/N-2/redundancy/connectivity-margin/optimizer results); this
 * component computes nothing new and issues no requests of its own. */

function Row({ label, info, children }: { label: string; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="flex items-center gap-1 text-muted-foreground">
        {label}
        {info}
      </span>
      <span className="text-right font-mono text-foreground">{children}</span>
    </div>
  );
}

const N1_N2_INFO = (
  <EngineeringInfo
    what="Полный точный анализ одиночных (N-1) и двойных (N-2) отказов спутников на всём расчётном горизонте."
    why="Отвечает на вопрос «выдержит ли сеть ЛЮБОЙ конкретный отказ на всём периоде», а не только в один момент."
    howToRead="PASS означает: целевой порог доступности не нарушается ни при одном проверенном отказе (или паре отказов). Это НЕ то же самое, что Connectivity Margin — тот считает snapshot topology в один момент, N-1/N-2 — целостную сервисную метрику за весь горизонт."
    docsRef="docs/resilience-analysis.md"
  />
);

function NotRun() {
  return <span className="font-sans text-muted-foreground">не запущено</span>;
}

export function ResiliencePassport({ metrics }: { metrics: Record<string, ClientMetrics> | null }) {
  const resilienceResults = useAppStore((s) => s.resilienceResults);
  const connectivityMargin = useAppStore((s) => s.connectivityMargin);
  const optimizer = useAppStore((s) => s.optimizer);

  const clientEntries = metrics ? Object.entries(metrics) : [];
  const normalWorst = clientEntries.length
    ? Math.min(...clientEntries.map(([, m]) => m.availability_percent))
    : null;
  const worstOutageS = clientEntries.length
    ? Math.max(...clientEntries.map(([, m]) => m.max_outage_s))
    : null;

  const n1 = resilienceResults.criticality;
  const n1Top = n1?.ranking[0] ?? null;
  const n1Pass = n1Top ? n1Top.target_violations_count === 0 : null;

  const n2 = resilienceResults.threshold;
  const n2Pass = n2 ? !n2.threshold_found : null;
  const n2WorstPair = n2?.worst_pairs[0] ?? null;

  const redundancy = resilienceResults.redundancy;
  const backupMean = redundancy
    ? Object.values(redundancy.clients).reduce((sum, c) => sum + c.backup_path_percent, 0) /
      Object.values(redundancy.clients).length
    : null;

  const dailyDay = connectivityMargin.dailyResult?.days[0] ?? null;
  const singleCheck = connectivityMargin.result;

  const cvar = optimizer.result?.mode === "failure_cvar" ? optimizer.result.best.failure_robust : null;

  const requiredIsl = REFERENCE_ACCEPTANCE_ROWS.find((row) => row.name.startsWith("Recommended Robust"))
    ?.islRequiredKm;

  const verdictParts: string[] = [];
  if (normalWorst != null) {
    verdictParts.push(
      normalWorst >= 90
        ? `Normal: цель ≥90% достигнута (худший ${normalWorst.toFixed(2)}%).`
        : `Normal: цель ≥90% НЕ достигнута (худший ${normalWorst.toFixed(2)}%).`
    );
  }
  if (n1Pass != null) verdictParts.push(n1Pass ? "N-1: пройдено." : "N-1: не пройдено.");
  if (n2Pass != null) verdictParts.push(n2Pass ? "N-2: пройдено." : "N-2: не пройдено.");
  const verdict =
    verdictParts.length > 0
      ? verdictParts.join(" ")
      : "Запустите Normal-расчёт и проверки N-1/N-2, чтобы получить вердикт.";
  const verdictOk = normalWorst != null && normalWorst >= 90 && n1Pass !== false && n2Pass !== false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Паспорт устойчивости</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Сводка уже посчитанных показателей текущей конфигурации в одном месте — не новый расчёт.
          Разделы, которые ещё не запускались, показаны как «не запущено» со ссылкой.
        </p>
        <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          <div>
            <Row label="Normal, худший клиент">
              {normalWorst != null ? formatPercent(normalWorst) : <NotRun />}
            </Row>
            <Row label="Худший перерыв">
              {worstOutageS != null ? formatDuration(worstOutageS) : <NotRun />}
            </Row>
            <Row label="N-1" info={N1_N2_INFO}>
              {n1Top ? (
                <span className="inline-flex items-center gap-1">
                  {n1Pass ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-ok" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-status-bad" />
                  )}
                  {n1Top.satellite_id} · −{n1Top.worst_client_availability_drop_pp.toFixed(2)} пп
                </span>
              ) : (
                <Link href="/resilience" className="text-primary hover:underline">
                  запустить N-1
                </Link>
              )}
            </Row>
            <Row label="N-2, худшая пара">
              {n2WorstPair ? (
                <span className="inline-flex items-center gap-1">
                  {n2Pass ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-ok" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-status-bad" />
                  )}
                  {n2WorstPair.satellite_ids.join("+")} · {formatPercent(n2WorstPair.worst_client_availability_percent)}
                </span>
              ) : (
                <Link href="/resilience" className="text-primary hover:underline">
                  запустить N-2
                </Link>
              )}
            </Row>
          </div>
          <div>
            <Row label="Резерв маршрута, среднее">
              {backupMean != null ? formatPercent(backupMean) : <NotRun />}
            </Row>
            <Row label="Connectivity margin, суточная">
              {dailyDay ? (
                `min ${dailyDay.minimum_vertex_connectivity} · mean ${dailyDay.mean_vertex_connectivity.toFixed(2)}`
              ) : singleCheck ? (
                `${singleCheck.vertex_connectivity} спутника(ов) в ${singleCheck.client_id}`
              ) : (
                <NotRun />
              )}
            </Row>
            <Row label="Требуемая дальность ISL">{requiredIsl != null ? `~${requiredIsl} км` : <NotRun />}</Row>
            <Row label="Failure-CVaR (K10)">
              {cvar ? `${(cvar.cvar_availability * 100).toFixed(2)}% @ α=${cvar.cvar_alpha}` : <NotRun />}
            </Row>
          </div>
        </div>
        <p className={`text-sm font-medium ${verdictOk ? "text-status-ok" : "text-status-bad"}`}>{verdict}</p>
      </CardContent>
    </Card>
  );
}
