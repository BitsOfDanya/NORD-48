"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useExamples } from "@/hooks/use-examples";
import { useRedundancy } from "@/hooks/use-redundancy";
import { formatPercent } from "@/lib/format";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";

const pct = formatPercent;

export function RedundancyAnalysis({ defaultScenarioId }: { defaultScenarioId: string }) {
  const { data: examples } = useExamples();
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const analysis = useRedundancy();
  const storedResult = useAppStore((state) => state.resilienceResults.redundancy);
  const result = analysis.data ?? storedResult ?? undefined;

  const clients = result ? Object.values(result.clients) : [];
  const n = clients.length || 1;
  const avgBackup = clients.reduce((sum, c) => sum + c.backup_path_percent, 0) / n;
  const avgSingle = clients.reduce((sum, c) => sum + c.single_path_percent, 0) / n;
  const avgNoRoute = clients.reduce((sum, c) => sum + c.no_route_percent, 0) / n;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Резервирование маршрутов (route redundancy)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto]">
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
          <Button
            disabled={analysis.isPending}
            onClick={() =>
              analysis.mutate({ scenario_id: scenarioId, routing_strategy: "minimum_hops" })
            }
          >
            {analysis.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {analysis.isPending ? "Считаем..." : "Проверить резервирование"}
          </Button>
          <p className="text-xs text-muted-foreground md:col-span-2">
            Для каждого клиента и каждого шага времени с активным маршрутом промежуточные
            спутники основного пути удаляются из графа и ищется независимый резервный
            маршрут. Три отдельных процента — не единая свёрнутая оценка (см.
            docs/network-redundancy.md).
          </p>
        </CardContent>
      </Card>

      {analysis.error && (
        <p className="rounded-md border border-status-bad/40 p-3 text-status-bad">
          {analysis.error.message}
        </p>
      )}

      {result && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent>
                <p className="text-xs text-muted-foreground">Есть резервный путь (в среднем)</p>
                <p className="mt-2 text-2xl font-semibold text-status-ok">{pct(avgBackup)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-muted-foreground">Единственный путь, без резерва</p>
                <p className="mt-2 text-2xl font-semibold text-status-warn">{pct(avgSingle)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-muted-foreground">Маршрута нет вообще</p>
                <p className="mt-2 text-2xl font-semibold text-status-bad">{pct(avgNoRoute)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>По клиентам</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2">Клиент</th>
                    <th className="text-right">Есть резерв</th>
                    <th className="text-right">Единственный путь</th>
                    <th className="text-right">Нет маршрута</th>
                    <th className="text-right">Шагов оценено</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(result.clients).map((client) => (
                    <tr key={client.client_id} className="border-t border-border">
                      <td className="py-2 font-medium">{client.client_id}</td>
                      <td className="text-right font-mono text-status-ok">
                        {pct(client.backup_path_percent)}
                      </td>
                      <td className="text-right font-mono text-status-warn">
                        {pct(client.single_path_percent)}
                      </td>
                      <td className="text-right font-mono text-status-bad">
                        {pct(client.no_route_percent)}
                      </td>
                      <td className="text-right font-mono text-xs">{client.steps_evaluated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
