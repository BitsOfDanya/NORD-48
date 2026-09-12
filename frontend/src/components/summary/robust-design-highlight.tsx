import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * One compact card, not a new dashboard section — see
 * docs/robust-design-search.md for the full search/validation. Numbers are
 * frozen from that verified run (same source as the Acceptance Matrix's
 * "Recommended Robust" row), not live-recomputed on every page load.
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
        <Link href="/optimizer" className="w-fit text-sm text-primary hover:underline">
          Открыть «Устойчивый поиск 2.0» в оптимизаторе →
        </Link>
      </CardContent>
    </Card>
  );
}
