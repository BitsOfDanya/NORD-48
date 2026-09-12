import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * One compact card, not a new dashboard section — see
 * docs/robust-design-search.md for the full search/validation. Numbers are
 * frozen from that verified run (same source as the Acceptance Matrix's
 * "Recommended Robust" row), not live-recomputed on every page load. The
 * degradation-behavior figures (ISL threshold, K=3 survival) come from the
 * same-methodology runs documented in docs/degradation-analysis.md.
 */
export function RobustDesignHighlight() {
  return (
    <Card className="ring-1 ring-primary/30">
      <CardHeader>
        <CardTitle>Найдена более устойчивая конфигурация (Robust Design Search 2.0)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">
              минимум: отказы / ISL 2000 км
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              67,78 % <span className="text-sm font-normal text-status-ok">+3,61 пп к Denis</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Штатный worst</p>
            <p className="font-mono text-lg font-semibold tabular-nums">96,53 %</p>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-status-ok">
            <CheckCircle2 className="h-4 w-4" /> N-1 пройден
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-status-ok">
            <CheckCircle2 className="h-4 w-4" /> N-2 пройден
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Раздельная оптимизация отказов аппаратов и ограничения ISL 2000 км нашла конфигурацию,
          которая лучше текущего проверенного кандидата (Denis, 64,17%) по обоим деградированным
          условиям сразу, при сохранении штатного target и обоих точных проверок отказоустойчивости.
        </p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
          <Stat label="Normal worst" value="96,53 %" />
          <Stat label="Outages worst" value="82,64 %" />
          <Stat label="ISL2000 worst" value="67,78 %" />
          <Stat label="Backup path (mean)" value="30,05 %" />
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Поведение при деградации
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Stat label="ISL threshold · Baseline" value="2750 км" />
            <Stat label="ISL threshold · Robust" value="2750 км" />
            <Stat label="K=3 survival · Baseline" value="91,00 %" />
            <Stat label="K=3 survival · Robust" value="92,00 %" />
          </div>
          <p className="text-xs text-muted-foreground">
            Одной фазировкой target 90% при ISL=2000 км не достигнут: при ISL 2000 км текущая
            архитектура 3×16 имеет недостаточную связность для target 90%. Robust Design улучшает
            худшую доступность, но не устраняет это структурное ограничение — требуемая дальность
            ISL для штатного target одинакова у обеих конфигураций (2750 км). При K=3 одновременных
            отказах спутников Robust немного выше по вероятности сохранить target (92% против 91%
            у baseline, 100 прогонов Monte Carlo, seed=42).
          </p>
        </div>

        <Link href="/optimizer" className="w-fit text-sm text-primary hover:underline">
          Открыть «Устойчивый поиск 2.0» в оптимизаторе →
        </Link>
        <Link href="/resilience" className="w-fit text-sm text-primary hover:underline">
          Открыть детальный анализ деградации →
        </Link>
      </CardContent>
    </Card>
  );
}
