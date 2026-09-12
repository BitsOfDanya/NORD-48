"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExamples } from "@/hooks/use-examples";
import { useFailureAnalysis } from "@/hooks/use-failure-analysis";
import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { getExample } from "@/lib/api/scenarios";
import { formatClock, formatDuration, formatPercent } from "@/lib/format";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";
import type { FailureTimelineStep } from "@/types/resilience";
import type { RoutingStrategy } from "@/types/simulation";

const STRATEGIES: { id: RoutingStrategy; label: string }[] = [
  { id: "minimum_hops", label: "Минимум переходов" },
  { id: "minimum_distance", label: "Минимальная длина" },
  { id: "maximum_margin", label: "Максимальный запас" },
  { id: "maximum_persistence", label: "Максимальная стабильность" },
];

function parseTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60;
}

function MetricCard({ client }: { client: NonNullable<ReturnType<typeof useFailureAnalysis>["data"]>["clients"][number] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{client.client_id}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-end gap-2 font-mono">
          <span className="text-xl">{formatPercent(client.baseline.availability_percent)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-xl">{formatPercent(client.failed.availability_percent)}</span>
        </div>
        <p className={client.delta.availability_pp < 0 ? "text-status-bad" : "text-status-ok"}>
          {client.delta.availability_pp.toFixed(2).replace(".", ",")} п.п.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <span className="text-muted-foreground">Max outage</span>
          <span className="text-right font-mono">
            {formatDuration(client.baseline.max_outage_s)} → {formatDuration(client.failed.max_outage_s)}
          </span>
          <span className="text-muted-foreground">Target</span>
          <span className="text-right font-mono">
            {client.baseline.target_reached ? "PASS" : "FAIL"} → {client.failed.target_reached ? "PASS" : "FAIL"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StepOutcome({ step }: { step: FailureTimelineStep }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-secondary/30 p-2.5 text-sm">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatClock(step.t_s)}</span>
        <span>До отказа: {step.baseline_available ? "связь есть" : "связи не было"}</span>
      </div>
      {step.failed_available ? (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-status-ok">
            {step.route_disrupted ? "Маршрут перестроен" : "Связь сохранена, маршрут не изменился"}
          </p>
          {step.failed_path.length > 0 && (
            <p className="font-mono text-xs text-muted-foreground">{step.failed_path.join(" → ")}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-status-bad">Связь отсутствует</p>
          {step.failed_reason && (
            <p className="text-xs text-muted-foreground">
              Причина: <strong className="text-foreground">{diagnosticReasonLabel(step.failed_reason)}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FailureLab({ defaultScenarioId }: { defaultScenarioId: string }) {
  const { data: examples } = useExamples();
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const { data: scenario } = useQuery({
    queryKey: ["scenario", scenarioId],
    queryFn: () => getExample(scenarioId),
  });
  const storedIds = useAppStore((state) => state.failureLabSatelliteIds);
  const setStoredIds = useAppStore((state) => state.setFailureLabSatelliteIds);
  const [start, setStart] = useState("06:00");
  const [end, setEnd] = useState("18:00");
  const [strategy, setStrategy] = useState<RoutingStrategy>("minimum_hops");
  const [selectedClient, setSelectedClient] = useState("C65");
  const [selectedStepTS, setSelectedStepTS] = useState<number | null>(null);
  const analysis = useFailureAnalysis();
  const storedResult = useAppStore((state) => state.resilienceResults.failure);
  const data = analysis.data ?? storedResult ?? undefined;

  const satellites = scenario?.design.satellites ?? [];
  const toggleSatellite = (id: string) => {
    const next = storedIds.includes(id)
      ? storedIds.filter((satelliteId) => satelliteId !== id)
      : [...storedIds, id];
    setStoredIds(next);
  };
  const timeline = data?.timeline_impact[selectedClient];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Failure Lab</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Сценарий</span>
            <Select value={scenarioId} onValueChange={(value) => { setScenarioId(value); setStoredIds([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{examples?.map((example) => (
                <SelectItem key={example.id} value={example.id}>{scenarioDisplayTitle(example.id, example.title)}</SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Стратегия маршрутизации</span>
            <Select value={strategy} onValueChange={(value) => setStrategy(value as RoutingStrategy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STRATEGIES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-sm font-medium">Спутники</span>
            <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-12">
              {satellites.map((satellite) => (
                <label key={satellite.id} className="flex items-center gap-1 text-xs">
                  <Checkbox checked={storedIds.includes(satellite.id)} onCheckedChange={() => toggleSatellite(satellite.id)} />
                  {satellite.id}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {["S14", "S31"].filter((id) => satellites.some((satellite) => satellite.id === id)).map((id) => (
                <Button key={id} size="xs" variant="outline" onClick={() => setStoredIds([id])}>{id}</Button>
              ))}
              <Button size="xs" variant="outline" onClick={() => { setStart("00:00"); setEnd("24:00"); }}>Отказ на сутки</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">Начало отказа<Input inputMode="numeric" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            <label className="flex flex-col gap-1 text-sm">Конец отказа<Input inputMode="numeric" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          </div>
          <div className="flex items-end">
            <Button
              disabled={!storedIds.length || analysis.isPending}
              onClick={() => analysis.mutate({ scenario_id: scenarioId, satellite_ids: storedIds, failure_start_s: parseTime(start), failure_end_s: parseTime(end), routing_strategy: strategy })}
            >
              {analysis.isPending ? <Loader2 className="animate-spin" /> : <Play />}
              {analysis.isPending ? "Расчёт..." : "Провести эксперимент"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {analysis.error && <p className="rounded-md border border-status-bad/40 p-3 text-status-bad">{analysis.error.message}</p>}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">{data.clients.map((client) => <MetricCard key={client.client_id} client={client} />)}</div>
          <Card>
            <CardHeader><CardTitle>Влияние на timeline</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Select
                value={selectedClient}
                onValueChange={(value) => { setSelectedClient(value); setSelectedStepTS(null); }}
              ><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{data.clients.map((client) => <SelectItem key={client.client_id} value={client.client_id}>{client.client_id}</SelectItem>)}</SelectContent></Select>
              {timeline && <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[72px_1fr] items-center gap-2"><span className="text-xs">BASELINE</span><div className="flex h-4 overflow-hidden rounded">{timeline.map((step) => <span key={step.t_s} className={step.baseline_available ? "flex-1 bg-primary" : "flex-1 bg-muted"} title={`${step.t_s} с`} />)}</div></div>
                <div className="grid grid-cols-[72px_1fr] items-center gap-2"><span className="text-xs">FAILURE</span><div className="flex h-4 cursor-pointer overflow-hidden rounded">{timeline.map((step) => <span key={step.t_s} className={step.failure_induced ? "flex-1 bg-status-bad" : step.failed_available ? "flex-1 bg-status-ok" : "flex-1 bg-muted"} title={`${step.t_s} с`} onClick={() => setSelectedStepTS(step.t_s)} />)}</div></div>
                <div className="ml-20 flex justify-between text-[10px] text-text-muted"><span>00:00</span><span>12:00</span><span>24:00</span></div>
              </div>}
              <p className="text-xs text-muted-foreground">Coral отмечает интервалы, где baseline имел связь, а failure variant её потерял. Кликните по полосе FAILURE, чтобы увидеть маршрут/причину в этот момент.</p>
              {timeline && selectedStepTS != null && (() => {
                const step = timeline.find((s) => s.t_s === selectedStepTS);
                return step ? <StepOutcome step={step} /> : null;
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
