"use client";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { REFERENCE_ACCEPTANCE_ROWS } from "@/lib/acceptance-reference";
import { formatPercent } from "@/lib/format";

/** «Что нужно изменить, чтобы достичь цели?» — не новый расчёт, а сборка
 * уже verified чисел (Acceptance Matrix reference rows + deployment
 * sequence из docs/deployment-optimization.md) в один инженерный вывод с
 * явными levers. Каждое число указывает, для какой ИМЕННО конфигурации/
 * setup оно было получено — не выдаётся за универсальную гарантию. */

const ROBUST = REFERENCE_ACCEPTANCE_ROWS.find((row) => row.name.startsWith("Recommended Robust"))!;
const N44 = REFERENCE_ACCEPTANCE_ROWS.find((row) => row.satelliteCount === 44)!;
const N46 = REFERENCE_ACCEPTANCE_ROWS.find((row) => row.satelliteCount === 46)!;

const TARGET_PERCENT = 90;

// Robust-2.0-geometry nested deployment sequence — exact greedy sweep,
// see docs/deployment-optimization.md ("Nested sequence под геометрией
// Recommended Robust 2.0"). Frozen, verified numbers, not recomputed here.
const DEPLOYMENT_STAGES = [
  { stage: 1, satellites: 16, worstPercent: 32.22 },
  { stage: 2, satellites: 32, worstPercent: 65.56 },
  { stage: 3, satellites: 48, worstPercent: ROBUST.normalWorstPercent },
];

function Lever({ label, current, target, gapLabel, note }: {
  label: string;
  current: string;
  target: string;
  gapLabel: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {current} / target {target}
        </span>
      </div>
      <p className="text-[11px] text-status-warn">{gapLabel}</p>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

export function TargetClosurePanel() {
  const isl2000Gap = TARGET_PERCENT - ROBUST.isl2000WorstPercent;
  const nextStage = DEPLOYMENT_STAGES.find((s) => s.worstPercent < TARGET_PERCENT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target Closure — что нужно изменить, чтобы достичь цели</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Не отдельный оптимизатор — сборка уже exact-verified результатов (Acceptance Matrix,
          ISL sensitivity, deployment sequence) в инженерные рычаги (levers). Каждое число указывает
          конкретный setup, для которого оно получено.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Lever
            label="ISL2000 (ограничение дальности)"
            current={formatPercent(ROBUST.isl2000WorstPercent)}
            target={`${TARGET_PERCENT}%`}
            gapLabel={`Gap: ${isl2000Gap.toFixed(2)} пп`}
            note={
              `При текущей геометрии Recommended Robust 2.0 ограничение ISL=2000 км — структурный ` +
              `bottleneck. В exact-проверенном sweep для этого design достижение ~90% потребовало ` +
              `дальность ~${ROBUST.islRequiredKm} км (см. docs/isl-sensitivity.md) — это НЕ гарантия ` +
              `для произвольного сценария, только для этого design.`
            }
          />
          <Lever
            label="Число спутников (N-1/N-2 ladder)"
            current={`N=${N44.satelliteCount}`}
            target={`N=${ROBUST.satelliteCount}`}
            gapLabel={`Gap: ${ROBUST.satelliteCount! - N44.satelliteCount!} спутника до полной устойчивости к N-2`}
            note={
              `N=${N44.satelliteCount} — nominal service (target достигнут, ${formatPercent(N44.normalWorstPercent)}, N-1/N-2 FAIL); ` +
              `N=${N46.satelliteCount} — выдерживает одиночный отказ (${formatPercent(N46.normalWorstPercent)}, N-1 PASS, N-2 FAIL); ` +
              `N=${ROBUST.satelliteCount} — выдерживает одиночный и двойной (N-1 PASS, N-2 PASS). ` +
              `Best/first found текущей эвристикой, не математический минимум.`
            }
          />
          {nextStage && (
            <Lever
              label="Этап развёртывания (staged deployment)"
              current={`Stage ${nextStage.stage} · N=${nextStage.satellites}`}
              target={`${TARGET_PERCENT}%`}
              gapLabel={`Gap: ${(TARGET_PERCENT - nextStage.worstPercent).toFixed(2)} пп до следующего launch`}
              note={
                `Оптимизированный состав (не наивный по launch_batch) под геометрией Recommended ` +
                `Robust 2.0 — см. docs/deployment-optimization.md. Следующий launch добавляет ` +
                `спутники по тому же жадному составу, не меняя уже выведенные.`
              }
            />
          )}
          <Lever
            label="Геометрия (Baseline → Recommended Robust 2.0)"
            current={formatPercent(REFERENCE_ACCEPTANCE_ROWS[0].outagesWorstPercent)}
            target={formatPercent(ROBUST.outagesWorstPercent)}
            gapLabel={`Outages: ${REFERENCE_ACCEPTANCE_ROWS[0].outagesWorstPercent.toFixed(2)}% → ${ROBUST.outagesWorstPercent.toFixed(2)}%, ISL2000: ${REFERENCE_ACCEPTANCE_ROWS[0].isl2000WorstPercent.toFixed(2)}% → ${ROBUST.isl2000WorstPercent.toFixed(2)}%`}
            note="Смена RAAN/phase (без изменения числа спутников) улучшает деградированную устойчивость почти без потери штатной доступности (96.67% → 96.53%)."
          />
        </div>

        <div className="flex gap-3 text-xs">
          <Link href="/optimizer" className="text-primary hover:underline">
            Подробнее: Оптимизатор →
          </Link>
          <Link href="/resilience" className="text-primary hover:underline">
            Подробнее: Отказоустойчивость →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
