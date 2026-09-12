"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useExamples } from "@/hooks/use-examples";
import { useN2Threshold } from "@/hooks/use-n2-threshold";
import { formatDuration } from "@/lib/format";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";

function pct(value: number) {
  return `${(value * 100).toFixed(2).replace(".", ",")} %`;
}

export function FailureThreshold({ defaultScenarioId }: { defaultScenarioId: string }) {
  const router = useRouter();
  const { data: examples } = useExamples();
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const analysis = useN2Threshold();
  const selectExample = useAppStore((state) => state.selectExampleScenario);
  const highlight = useAppStore((state) => state.setHighlightedSatelliteIds);
  const storedResult = useAppStore((state) => state.resilienceResults.threshold);
  const result = analysis.data ?? storedResult ?? undefined;
  const worst = result?.worst_pairs[0];

  return <div className="flex flex-col gap-4">
    <Card><CardHeader><CardTitle>Точная проверка порога отказоустойчивости · N-2</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-[1fr_auto]"><Select value={scenarioId} onValueChange={setScenarioId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{examples?.map((example) => <SelectItem key={example.id} value={example.id}>{scenarioDisplayTitle(example.id, example.title)}</SelectItem>)}</SelectContent></Select><Button disabled={analysis.isPending} onClick={() => analysis.mutate({ scenario_id: scenarioId, analysis_start_s: 0, analysis_end_s: 86400, routing_strategy: "minimum_hops" })}>{analysis.isPending ? <Loader2 className="animate-spin" /> : <Play />}{analysis.isPending ? "Проверяем все пары..." : "Запустить точный расчёт N-2"}</Button><p className="text-xs text-muted-foreground md:col-span-2">Проверяются все пары активных аппаратов на полном горизонте. Геометрия рассчитывается один раз, а слой отказов не изменяет исходный сценарий.</p></CardContent></Card>
    {analysis.error && <p className="rounded-md border border-status-bad/40 p-3 text-status-bad">{analysis.error.message}</p>}
    {result && <>
      <div className="grid gap-4 md:grid-cols-3"><Card><CardContent><p className="text-xs text-muted-foreground">N-1</p><p className="mt-2 text-2xl font-semibold">{result.n1.combinations_evaluated}</p><p className="text-xs">Нарушений цели: {result.n1.target_breaking_count}</p></CardContent></Card><Card><CardContent><p className="text-xs text-muted-foreground">N-2</p><p className="mt-2 text-2xl font-semibold">{result.experiment.combinations_evaluated}</p><p className="text-xs">Нарушений цели: {result.target_breaking_pairs_count}</p></CardContent></Card><Card><CardContent><p className="text-xs text-muted-foreground">Порог</p><p className="mt-2 text-2xl font-semibold">{result.threshold_label} отказов</p><p className="text-xs">Расчёт: {result.benchmark.runtime_s.toFixed(1)} с</p></CardContent></Card></div>
      {worst && <Card><CardHeader><CardTitle>Самая опасная пара</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-[1fr_auto]"><div><p className="font-mono text-2xl font-semibold">{worst.satellite_ids.join(" + ")}</p><p className="mt-2 text-sm">Худший пункт: <strong>{worst.worst_client_id}</strong></p><p className="text-sm">Доступность: {pct(worst.clients.find((client) => client.client_id === worst.worst_client_id)?.baseline_availability ?? 0)} → <strong>{pct(worst.worst_client_availability)}</strong> · −{worst.availability_drop_pp.toFixed(2)} п.п.</p><p className="text-sm">Δ max outage: +{formatDuration(worst.max_outage_increase_s)}</p></div><Button variant="outline" onClick={() => { selectExample(scenarioId); highlight(worst.satellite_ids); router.push("/"); }}>Показать пару на глобусе</Button></CardContent></Card>}
      <Card><CardHeader><CardTitle>Наиболее опасные пары</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Ранг</th><th>Пара</th><th>Доступность худшего пункта</th><th>Снижение доступности</th><th>Нарушений цели</th><th>Рост макс. перерыва</th><th>Доп. эффект пары</th></tr></thead><tbody>{result.worst_pairs.map((pair) => <tr key={pair.satellite_ids.join("-")} className="border-t border-border"><td className="py-2">{pair.rank}</td><td className="font-mono font-semibold">{pair.satellite_ids.join(" + ")}</td><td>{pct(pair.worst_client_availability)}</td><td>−{pair.availability_drop_pp.toFixed(2)} п.п.</td><td>{pair.target_violations_count}</td><td>+{formatDuration(pair.max_outage_increase_s)}</td><td className={pair.additional_pair_effect_pp > 0 ? "text-status-warn" : ""}>{pair.additional_pair_effect_pp > 0 ? "+" : ""}{pair.additional_pair_effect_pp.toFixed(2)} п.п.</td></tr>)}</tbody></table><p className="mt-3 text-xs text-muted-foreground">В двадцати худших парах: {result.n1_n2_correlation.endpoints_in_top_10_n1} из {result.n1_n2_correlation.top_20_pair_endpoints} аппаратов также входят в десятку наиболее критичных по N-1.</p></CardContent></Card>
    </>}
  </div>;
}
