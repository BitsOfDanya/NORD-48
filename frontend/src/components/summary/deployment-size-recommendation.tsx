import { CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";

interface SizeOption {
  label: string;
  satelliteCount: number;
  normalWorstPercent: number;
  n1Pass: boolean;
  n2Pass: boolean;
  note: string;
}

const OPTIONS: SizeOption[] = [
  {
    label: "N=44 — минимум ресурсов",
    satelliteCount: 44,
    normalWorstPercent: 90.14,
    n1Pass: false,
    n2Pass: false,
    note: "Первый найденный размер, достигающий target ≥90% в штатном режиме. Нулевой запас: единичный отказ спутника опускает худшего клиента до ≈86,8%.",
  },
  {
    label: "N=46 — устойчив к одному отказу",
    satelliteCount: 46,
    normalWorstPercent: 93.33,
    n1Pass: true,
    n2Pass: false,
    note: "Первый найденный размер, сохраняющий target ≥90% даже после худшего единичного отказа (ровно 90,00%). Два одновременных отказа (N-2) всё ещё нарушают target у 99,9% пар.",
  },
  {
    label: "N=48 — полная группировка",
    satelliteCount: 48,
    normalWorstPercent: 96.67,
    n1Pass: true,
    n2Pass: true,
    note: "Единственный проверенный размер, сохраняющий target ≥90% после ЛЮБОГО одиночного ИЛИ парного отказа — максимальный резерв среди рассмотренных вариантов.",
  },
];

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ok ? "bg-status-ok/10 text-status-ok" : "bg-status-bad/10 text-status-bad"}`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

/**
 * Deliberately not a single weighted score: three verified candidates
 * side by side, same fields, so the satellite-count trade-off (fewer
 * satellites vs surviving a failure) stays visible instead of collapsed
 * into one "best" answer. Numbers are frozen from
 * docs/design-threshold-verification.md, same source as the Acceptance
 * Matrix's N=44/N=46 rows.
 */
export function DeploymentSizeRecommendation() {
  return (
    <Card className="ring-1 ring-primary/40">
      <CardHeader>
        <CardTitle>Выбор размера группировки: компромисс, не оценка</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Три проверенных кандидата, один и тот же набор проверок каждому — итоговое
          решение (сколько спутников резервировать) зависит от приоритета заказчика, не
          вычисляется автоматически.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {OPTIONS.map((option) => (
            <div key={option.label} className="rounded-md border border-border/60 bg-secondary/30 p-3">
              <p className="text-sm font-semibold">{option.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatPercent(option.normalWorstPercent)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                штатный worst · {option.satelliteCount} спутников
              </p>
              <div className="mt-2 flex gap-1.5">
                <StatusChip ok={option.n1Pass} label={`N-1 ${option.n1Pass ? "PASS" : "FAIL"}`} />
                <StatusChip ok={option.n2Pass} label={`N-2 ${option.n2Pass ? "PASS" : "FAIL"}`} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{option.note}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
