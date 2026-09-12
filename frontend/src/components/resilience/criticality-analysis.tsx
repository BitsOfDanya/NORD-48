"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCriticality } from "@/hooks/use-criticality";
import { useExamples } from "@/hooks/use-examples";
import { formatDuration } from "@/lib/format";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const STRATEGIES: RoutingStrategy[] = ["minimum_hops", "maximum_persistence"];
const LABELS: Record<RoutingStrategy, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
  maximum_margin: "Максимальный запас",
  maximum_persistence: "Максимальная стабильность",
};

function seconds(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60;
}

export function CriticalityAnalysis({ defaultScenarioId, onOpenFailure }: { defaultScenarioId: string; onOpenFailure: () => void }) {
  const { data: examples } = useExamples();
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const [start, setStart] = useState("00:00");
  const [end, setEnd] = useState("24:00");
  const [strategy, setStrategy] = useState<RoutingStrategy>("minimum_hops");
  const setFailureIds = useAppStore((state) => state.setFailureLabSatelliteIds);
  const criticality = useCriticality();
  const storedResult = useAppStore((state) => state.resilienceResults.criticality);
  const data = criticality.data ?? storedResult ?? undefined;

  return <div className="flex flex-col gap-4">
    <Card><CardHeader><CardTitle>Критичность аппаратов · N-1</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-5">
      <Select value={scenarioId} onValueChange={setScenarioId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{examples?.map((example) => <SelectItem key={example.id} value={example.id}>{scenarioDisplayTitle(example.id, example.title)}</SelectItem>)}</SelectContent></Select>
      <Input inputMode="numeric" value={start} onChange={(event) => setStart(event.target.value)} />
      <Input inputMode="numeric" value={end} onChange={(event) => setEnd(event.target.value)} />
      <Select value={strategy} onValueChange={(value) => setStrategy(value as RoutingStrategy)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STRATEGIES.map((item) => <SelectItem key={item} value={item}>{LABELS[item]}</SelectItem>)}</SelectContent></Select>
      <Button disabled={criticality.isPending} onClick={() => criticality.mutate({ scenario_id: scenarioId, analysis_start_s: seconds(start), analysis_end_s: seconds(end), routing_strategy: strategy })}>{criticality.isPending ? <Loader2 className="animate-spin" /> : <Play />}{criticality.isPending ? "N-1 расчёт..." : "Запустить N-1"}</Button>
    </CardContent></Card>
    {criticality.error && <p className="rounded-md border border-status-bad/40 p-3 text-status-bad">{criticality.error.message}</p>}
    {data && <>
      <Card><CardHeader><CardTitle>Инженерная рекомендация</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{data.recommendation}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Критические аппараты</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b text-left text-[11px] uppercase text-text-muted"><th className="py-2">Ранг</th><th>Аппарат</th><th>Плоскость</th><th className="text-right">Нарушений цели</th><th className="text-right">Макс. снижение доступности</th><th className="text-right">Рост макс. перерыва</th><th className="text-right">Затронуто пунктов</th><th /></tr></thead><tbody>{data.ranking.map((row) => <tr key={row.satellite_id} className="border-b border-border/60"><td className="py-2 font-mono">{row.rank}</td><td className="font-mono font-semibold">{row.satellite_id}</td><td>{row.plane_id}</td><td className="text-right font-mono">{row.target_violations_count}</td><td className="text-right font-mono text-status-bad">−{row.worst_client_availability_drop_pp.toFixed(2).replace(".", ",")} п.п.</td><td className="text-right font-mono">+{formatDuration(row.max_outage_increase_s)}</td><td className="text-right font-mono">{row.affected_clients_count}</td><td className="text-right"><Button size="xs" variant="outline" onClick={() => { setFailureIds([row.satellite_id]); onOpenFailure(); }}>Открыть анализ отказа</Button></td></tr>)}</tbody></table></CardContent></Card>
    </>}
  </div>;
}
