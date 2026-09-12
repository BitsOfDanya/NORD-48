"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Play, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConnectivityMargin, useDailyConnectivity } from "@/hooks/use-connectivity-margin";
import { useExamples } from "@/hooks/use-examples";
import { getExample } from "@/lib/api/scenarios";
import { formatClock } from "@/lib/format";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { DailyConnectivityDay } from "@/types/connectivity-margin";

function parseTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 3600 + (minutes || 0) * 60;
}

function marginSeverity(margin: number): { tone: "ok" | "warn" | "bad"; text: string } {
  if (margin === 0) {
    return { tone: "bad", text: "Сквозной маршрут отсутствует." };
  }
  if (margin === 1) {
    return {
      tone: "warn",
      text: "Связность уязвима: одного отказа спутника достаточно для потери маршрута.",
    };
  }
  return {
    tone: "ok",
    text: `Для разрыва текущей связности необходимо вывести из строя как минимум ${margin} спутника(ов).`,
  };
}

function DistributionRow({ day }: { day: DailyConnectivityDay }) {
  const { no_route_pct, margin_1_pct, margin_2_pct, margin_3_plus_pct } = day;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-status-bad" style={{ width: `${no_route_pct}%` }} title={`Нет маршрута: ${no_route_pct.toFixed(1)}%`} />
        <div className="h-full bg-status-warn" style={{ width: `${margin_1_pct}%` }} title={`Margin 1: ${margin_1_pct.toFixed(1)}%`} />
        <div className="h-full bg-status-ok/60" style={{ width: `${margin_2_pct}%` }} title={`Margin 2: ${margin_2_pct.toFixed(1)}%`} />
        <div className="h-full bg-status-ok" style={{ width: `${margin_3_plus_pct}%` }} title={`Margin >=3: ${margin_3_plus_pct.toFixed(1)}%`} />
      </div>
      <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
        <span>Нет маршрута {no_route_pct.toFixed(1)}%</span>
        <span>Margin 1 {margin_1_pct.toFixed(1)}%</span>
        <span>Margin 2 {margin_2_pct.toFixed(1)}%</span>
        <span>Margin ≥3 {margin_3_plus_pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function ConnectivityMarginPanel({ defaultScenarioId }: { defaultScenarioId: string }) {
  const { data: examples } = useExamples();
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const { data: scenario } = useQuery({
    queryKey: ["scenario", scenarioId],
    queryFn: () => getExample(scenarioId),
  });
  const clients = scenario?.ground_sites.filter((site) => site.role === "client") ?? [];
  const [selectedClientId, setSelectedClientId] = useState("");
  const [timeInput, setTimeInput] = useState("06:00");

  // The client list comes from whichever scenario is currently loaded —
  // derived at render time so a scenario switch (or a previously selected
  // client that no longer exists) falls back to the first available
  // client instead of a hardcoded reference ID, without an effect.
  const clientId = clients.some((site) => site.id === selectedClientId)
    ? selectedClientId
    : (clients[0]?.id ?? "");
  const setClientId = setSelectedClientId;

  const persisted = useAppStore((s) => s.connectivityMargin);
  const margin = useConnectivityMargin();
  const daily = useDailyConnectivity();
  const result = margin.data ?? persisted.result ?? undefined;
  const dailyResult = daily.data ?? persisted.dailyResult ?? undefined;

  const severity = result ? marginSeverity(result.vertex_connectivity) : null;
  const SeverityIcon = severity?.tone === "ok" ? ShieldCheck : severity?.tone === "warn" ? ShieldAlert : ShieldX;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div>
        <h3 className="text-sm font-semibold">Топологический запас связности (dynamic min-cut)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Минимальное число спутников, совместный отказ которых разрывает связь клиента со ВСЕМИ
          доступными шлюзами одновременно (не с одним произвольным). Если минимальных разрезов
          несколько, показывается один найденный набор — не «все критические спутники».
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Момент времени</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_140px_100px_auto] md:items-end">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Сценарий</span>
            <Select value={scenarioId} onValueChange={setScenarioId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {examples?.map((example) => (
                  <SelectItem key={example.id} value={example.id}>
                    {scenarioDisplayTitle(example.id, example.title)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Клиент</span>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {clients.map((site) => (
                  <SelectItem key={site.id} value={site.id}>{site.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Время</span>
            <Input inputMode="numeric" value={timeInput} onChange={(e) => setTimeInput(e.target.value)} />
          </div>
          <Button
            disabled={margin.isPending || !clientId}
            onClick={() =>
              margin.mutate({ scenario_id: scenarioId, client_id: clientId, t_s: parseTime(timeInput) })
            }
          >
            {margin.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            Проверить
          </Button>
        </CardContent>
      </Card>

      {margin.error && (
        <p className="flex items-center gap-1.5 text-sm text-status-bad">
          <AlertTriangle className="h-4 w-4" /> {margin.error.message}
        </p>
      )}

      {result && severity && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center gap-3">
              <SeverityIcon
                className={cn(
                  "h-8 w-8",
                  severity.tone === "ok" && "text-status-ok",
                  severity.tone === "warn" && "text-status-warn",
                  severity.tone === "bad" && "text-status-bad"
                )}
              />
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums">
                  {result.vertex_connectivity} {result.vertex_connectivity === 1 ? "спутник" : "спутника"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.client_id} · {formatClock(result.t_s)}
                </p>
              </div>
            </div>
            <p
              className={cn(
                "text-sm",
                severity.tone === "ok" && "text-status-ok",
                severity.tone === "warn" && "text-status-warn",
                severity.tone === "bad" && "text-status-bad"
              )}
            >
              {severity.text}
            </p>
            {result.critical_satellites.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-md border border-border bg-secondary/30 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Минимальный разрез
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.critical_satellites.map((sat) => (
                    <span key={sat} className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-xs">
                      {sat}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Один из минимальных наборов спутников, совместный отказ которых разрывает связь
                  клиента со шлюзом(ами). При наличии нескольких минимальных разрезов показан
                  только этот.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Суточная агрегация</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={daily.isPending || !clientId}
            onClick={() => daily.mutate({ scenario_id: scenarioId, client_id: clientId })}
          >
            {daily.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            Запустить суточный анализ
          </Button>
        </CardHeader>
        {daily.error && (
          <CardContent>
            <p className="text-sm text-status-bad">{daily.error.message}</p>
          </CardContent>
        )}
        {dailyResult && (
          <CardContent className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Частота попадания спутника в найденный минимальный разрез на каждом шаге — это
              частота появления в min-cut, а не вероятность отказа или абсолютная критичность.
            </p>
            {dailyResult.days.map((day) => (
              <div key={day.day_start_s} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {formatClock(day.day_start_s)}–{formatClock(day.day_end_s)} · {day.samples_evaluated} отсчётов
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Минимум</p>
                    <p className="font-mono font-semibold">{day.minimum_vertex_connectivity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Среднее</p>
                    <p className="font-mono font-semibold">{day.mean_vertex_connectivity.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Среднее при наличии связи</p>
                    <p className="font-mono font-semibold">
                      {day.average_when_connected != null ? day.average_when_connected.toFixed(2) : "—"}
                    </p>
                  </div>
                </div>
                <DistributionRow day={day} />
                {day.critical_satellites.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {day.critical_satellites.slice(0, 8).map((sat) => (
                      <span
                        key={sat.satellite_id}
                        className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px]"
                        title={`${sat.critical_samples} из ${day.samples_evaluated} отсчётов`}
                      >
                        {sat.satellite_id} · {(sat.critical_fraction * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
