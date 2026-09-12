"use client";

import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { REFERENCE_ACCEPTANCE_ROWS, type AcceptanceRow, type AcceptanceStatus } from "@/lib/acceptance-reference";

function StatusBadge({ status }: { status: AcceptanceStatus }) {
  if (status === "pass") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-status-ok/10 px-2 py-0.5 text-[11px] font-semibold text-status-ok">
        <CheckCircle2 className="h-3 w-3" /> пройдено
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-status-bad/10 px-2 py-0.5 text-[11px] font-semibold text-status-bad">
        <XCircle className="h-3 w-3" /> не пройдено
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <AlertCircle className="h-3 w-3" /> не проверено
    </span>
  );
}

function percentCell(value: number) {
  const tone = value >= 90 ? "text-status-ok" : value >= 70 ? "text-status-warn" : "text-status-bad";
  return (
    <span className={cn("font-mono tabular-nums", tone)}>{value.toFixed(2).replace(".", ",")} %</span>
  );
}

function optionalCell(value: string | null | undefined) {
  return (
    <span className={cn("font-mono tabular-nums", value == null && "text-muted-foreground")}>
      {value ?? "—"}
    </span>
  );
}

/**
 * A single decision screen comparing candidate configurations across every
 * mode this project computes (normal/degraded availability, N-1, N-2) —
 * not another chart, a table with explicit PASS/FAIL/INFO statuses, no
 * hidden scoring. `extraRows` merges in the current live optimizer result
 * (if any) alongside the fixed, pre-verified reference candidates from
 * docs/design-decision.md.
 */
export function AcceptanceMatrix({ extraRows = [] }: { extraRows?: AcceptanceRow[] }) {
  const rows = [...extraRows, ...REFERENCE_ACCEPTANCE_ROWS];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Матрица инженерных критериев</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-3 font-medium">Конфигурация</th>
              <th className="px-2 py-2 text-right font-medium">Штатный · худший</th>
              <th className="px-2 py-2 text-right font-medium">Отказы · худший</th>
              <th className="px-2 py-2 text-right font-medium">ISL 2000 · худший</th>
              <th className="px-2 py-2 text-center font-medium">N-1</th>
              <th className="px-2 py-2 text-center font-medium">N-2</th>
              <th className="px-2 py-2 text-right font-medium">Худший перерыв</th>
              <th className="px-2 py-2 text-center font-medium">Цель · штатный</th>
              <th className="px-2 py-2 text-center font-medium">Цель · деградация</th>
              <th className="px-2 py-2 text-right font-medium">Запас до цели</th>
              <th className="px-2 py-2 text-right font-medium">Есть резерв</th>
              <th className="px-2 py-2 text-right font-medium">ISL нужен</th>
              <th className="px-2 py-2 text-right font-medium">Спутников</th>
              <th className="px-2 py-2 text-right font-medium">Пусков</th>
              <th className="py-2 pl-2 text-right font-medium">Оценка стоимости</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border/60 align-top">
                <td className="py-2 pr-3">
                  <p className="font-medium text-foreground">{row.name}</p>
                  <p className="text-[11px] text-muted-foreground">{row.source}</p>
                  {row.note && <p className="mt-0.5 text-[11px] text-status-warn">{row.note}</p>}
                </td>
                <td className="px-2 py-2 text-right">{percentCell(row.normalWorstPercent)}</td>
                <td className="px-2 py-2 text-right">{percentCell(row.outagesWorstPercent)}</td>
                <td className="px-2 py-2 text-right">{percentCell(row.isl2000WorstPercent)}</td>
                <td className="px-2 py-2 text-center"><StatusBadge status={row.n1Status} /></td>
                <td className="px-2 py-2 text-center"><StatusBadge status={row.n2Status} /></td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {formatDuration(row.worstMaxOutageS)}
                </td>
                <td className="px-2 py-2 text-center"><StatusBadge status={row.targetNormal} /></td>
                <td className="px-2 py-2 text-center"><StatusBadge status={row.targetDegraded} /></td>
                <td className="px-2 py-2 text-right">
                  {optionalCell(
                    row.targetMarginPp != null
                      ? `${row.targetMarginPp >= 0 ? "+" : ""}${row.targetMarginPp.toFixed(2)} пп`
                      : null
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {optionalCell(
                    row.backupPathAvailabilityPercent != null
                      ? `${row.backupPathAvailabilityPercent.toFixed(1)} %`
                      : null
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {optionalCell(row.islRequiredKm != null ? `${row.islRequiredKm} км` : null)}
                </td>
                <td className="px-2 py-2 text-right">
                  {optionalCell(row.satelliteCount != null ? String(row.satelliteCount) : null)}
                </td>
                <td className="px-2 py-2 text-right">
                  {optionalCell(row.launchStages != null ? String(row.launchStages) : null)}
                </td>
                <td className="py-2 pl-2 text-right">
                  {optionalCell(
                    row.estimatedCostRub != null
                      ? `${Math.round(row.estimatedCostRub).toLocaleString("ru-RU")} ₽`
                      : null
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          Базовый / Denis / Ограниченно-устойчивый — зафиксированные точные прогоны из
          docs/design-decision.md (пересчёт N-1/N-2 для каждого варианта на каждой
          загрузке страницы занял бы минуты). Текущий результат оптимизации (если есть)
          показывает штатную доступность худшего пункта и достижение цели из этого прогона;
          N-1/N-2 для него не считаются автоматически. Статус «не проверено» не означает отказ критерия.
        </p>
      </CardContent>
    </Card>
  );
}
