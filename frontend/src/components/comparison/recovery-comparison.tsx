"use client";

import { ArrowRight, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecoveryComparison } from "@/hooks/use-recovery-comparison";
import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock, formatDuration } from "@/lib/format";
import type { RecoveryTransitionExample } from "@/types/comparison";

function ExampleCard({
  title,
  icon,
  example,
  pathKey,
  reasonKey,
  reasonLabel,
  tone,
}: {
  title: string;
  icon: ReactNode;
  example: RecoveryTransitionExample;
  pathKey: "candidate_path" | "baseline_path";
  reasonKey: "baseline_reason" | "candidate_reason";
  reasonLabel: string;
  tone: "ok" | "bad";
}) {
  const path = example[pathKey];
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5 text-xs">
      <div className={tone === "ok" ? "flex items-center gap-1.5 text-status-ok" : "flex items-center gap-1.5 text-status-bad"}>
        {icon}
        <span className="font-semibold">{title}</span>
      </div>
      <p>
        <span className="text-muted-foreground">Клиент: </span>
        <span className="font-mono font-medium">{example.client_id}</span>
        <span className="text-muted-foreground"> · момент: </span>
        <span className="font-mono">{formatClock(example.t_s)}</span>
      </p>
      <p>
        <span className="text-muted-foreground">{reasonLabel}: </span>
        <strong>{diagnosticReasonLabel(example[reasonKey])}</strong>
      </p>
      {path && path.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {path.map((node, i) => (
            <span key={`${node}-${i}`} className="flex items-center gap-1">
              <span className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono">{node}</span>
              {i < path.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-text-muted" />}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecoveryComparison({
  baselineRunId,
  baselineLabel,
  candidateRunId,
  candidateLabel,
}: {
  baselineRunId: string;
  baselineLabel: string;
  candidateRunId: string;
  candidateLabel: string;
}) {
  const { data, isLoading, error } = useRecoveryComparison(baselineRunId, candidateRunId);

  if (baselineRunId === candidateRunId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Восстановление связности · {candidateLabel} vs {baselineLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Интервалы, где у baseline не было маршрута, а у сравниваемого варианта — есть
          («восстановлено»), и честно — обратные случаи («регрессия»). Пересчитано по фактическим
          маршрутным таймлайнам обоих запусков, без нового движка симуляции.
        </p>

        {isLoading && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Считаем разницу...
          </p>
        )}
        {error && <p className="text-sm text-status-bad">Не удалось получить сравнение восстановления.</p>}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-status-ok/40 bg-status-ok/5 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Восстановлено</p>
                <p className="font-mono text-sm font-semibold text-status-ok">
                  {formatDuration(data.summary.total_recovered_seconds)}
                </p>
              </div>
              <div className="rounded-md border border-status-bad/40 bg-status-bad/5 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Регрессия (потеряно)</p>
                <p className="font-mono text-sm font-semibold text-status-bad">
                  {formatDuration(data.summary.total_lost_seconds)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-secondary/40 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Net</p>
                <p className="font-mono text-sm font-semibold">
                  {data.summary.total_net_recovered_seconds >= 0 ? "+" : ""}
                  {formatDuration(Math.abs(data.summary.total_net_recovered_seconds))}
                </p>
              </div>
            </div>

            {data.dominant_recovery_reason && (
              <p className="text-xs text-muted-foreground">
                Основная причина, устранённая восстановлением:{" "}
                <strong className="text-foreground">
                  {diagnosticReasonLabel(data.dominant_recovery_reason)}
                </strong>
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th className="py-1">Пункт</th>
                    <th className="text-right">Восстановлено</th>
                    <th className="text-right">Потеряно</th>
                    <th className="text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(data.per_client).map((stats) => (
                    <tr key={stats.client_id} className="border-t border-border/60">
                      <td className="py-1 font-mono font-medium">{stats.client_id}</td>
                      <td className="text-right font-mono text-status-ok">
                        {formatDuration(stats.recovered_seconds)}
                      </td>
                      <td className="text-right font-mono text-status-bad">
                        {formatDuration(stats.lost_seconds)}
                      </td>
                      <td className="text-right font-mono">
                        {stats.net_recovered_seconds >= 0 ? "+" : ""}
                        {formatDuration(Math.abs(stats.net_recovered_seconds))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {data.recovered_example && (
                <ExampleCard
                  title="Пример: восстановлено"
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  example={data.recovered_example}
                  pathKey="candidate_path"
                  reasonKey="baseline_reason"
                  reasonLabel="Причина отказа у baseline"
                  tone="ok"
                />
              )}
              {data.lost_example && (
                <ExampleCard
                  title="Пример: регрессия"
                  icon={<TrendingDown className="h-3.5 w-3.5" />}
                  example={data.lost_example}
                  pathKey="baseline_path"
                  reasonKey="candidate_reason"
                  reasonLabel="Причина отказа у сравниваемого варианта"
                  tone="bad"
                />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
