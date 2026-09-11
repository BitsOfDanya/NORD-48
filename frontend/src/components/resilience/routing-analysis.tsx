"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExamples } from "@/hooks/use-examples";
import { useRoutingAnalysis } from "@/hooks/use-routing-analysis";
import { formatDuration, formatPercent } from "@/lib/format";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import type { RoutingStrategy } from "@/types/simulation";

const LABELS: Record<RoutingStrategy, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
  maximum_margin: "Максимальный запас",
  maximum_persistence: "Максимальная стабильность",
};

function value(value: number | null, formatter: (number: number) => string): string {
  return value == null ? "—" : formatter(value);
}

export function RoutingAnalysis({ defaultScenarioId }: { defaultScenarioId: string }) {
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const { data: examples } = useExamples();
  const analysis = useRoutingAnalysis();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Точное сравнение маршрутизации</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">Сценарий</span>
            <Select value={scenarioId} onValueChange={setScenarioId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {examples?.map((example) => (
                  <SelectItem key={example.id} value={example.id}>
                    {scenarioDisplayTitle(example.id, example.title)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={analysis.isPending || !scenarioId}
            onClick={() => analysis.mutate({ scenario_id: scenarioId })}
          >
            {analysis.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {analysis.isPending ? "Анализ 720 состояний..." : "Провести сравнение стратегий"}
          </Button>
        </CardContent>
      </Card>

      {analysis.error && (
        <p className="rounded-md border border-status-bad/40 p-3 text-sm text-status-bad">
          {analysis.error instanceof Error ? analysis.error.message : "Ошибка анализа"}
        </p>
      )}

      {analysis.data && (
        <>
          <Card className="ring-primary/40">
            <CardHeader><CardTitle>Рекомендуемая стратегия</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Badge className="w-fit">{LABELS[analysis.data.recommended_strategy]}</Badge>
              <p className="text-sm text-muted-foreground">{analysis.data.recommended_reason}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Стратегии × наземные пункты</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase text-text-muted">
                    <th className="py-2 pr-2">Стратегия</th><th className="px-2">Пункт</th>
                    <th className="px-2 text-right">Availability</th>
                    <th className="px-2 text-right">Median lifetime</th>
                    <th className="px-2 text-right">P05 lifetime</th>
                    <th className="px-2 text-right">Mean margin</th>
                    <th className="px-2 text-right">P05 margin</th>
                    <th className="px-2 text-right">Перестроения</th>
                    <th className="pl-2 text-right">Mean hops</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.data.rows.map((row) => (
                    <tr key={`${row.strategy}-${row.client_id}`} className="border-b border-border/60">
                      <td className="py-2 pr-2">{LABELS[row.strategy]}</td>
                      <td className="px-2 font-mono">{row.client_id}</td>
                      <td className="px-2 text-right font-mono">{formatPercent(row.availability * 100)}</td>
                      <td className="px-2 text-right font-mono">{value(row.median_route_lifetime_s, formatDuration)}</td>
                      <td className="px-2 text-right font-mono">{value(row.p05_route_lifetime_s, formatDuration)}</td>
                      <td className="px-2 text-right font-mono">{value(row.mean_bottleneck_margin, (v) => formatPercent(v * 100))}</td>
                      <td className="px-2 text-right font-mono">{value(row.p05_bottleneck_margin, (v) => formatPercent(v * 100))}</td>
                      <td className="px-2 text-right font-mono">{row.route_change_count}</td>
                      <td className="pl-2 text-right font-mono">{value(row.mean_hops, (v) => v.toFixed(2).replace(".", ","))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Lifetime рассчитан по фактически выбранным непрерывным сегментам маршрута;
                запас и hops — по доступным snapshot.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
