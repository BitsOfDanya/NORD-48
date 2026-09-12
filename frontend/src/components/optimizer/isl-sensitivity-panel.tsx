"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useIslSensitivity } from "@/hooks/use-isl-sensitivity";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const DEFAULT_ISL_VALUES = [1000, 1250, 1500, 1750, 2000, 2250, 2500, 3000];

export function IslSensitivityPanel({ scenarioId }: { scenarioId: string }) {
  const analysis = useIslSensitivity();
  const persisted = useAppStore((s) => s.islSensitivity);
  const result = analysis.data ?? persisted.result ?? undefined;

  const [valuesText, setValuesText] = useState(DEFAULT_ISL_VALUES.join(","));
  const [refine, setRefine] = useState(true);

  const run = () => {
    const isl_values_km = valuesText
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    const routing_strategy: RoutingStrategy = "minimum_hops";
    analysis.mutate({
      scenario_id: scenarioId,
      routing_strategy,
      isl_values_km,
      refine,
      refine_step_km: 50,
    });
  };

  const chartData = [...(result?.coarse_points ?? []), ...(result?.refined_points ?? [])]
    .sort((a, b) => a.isl_range_km - b.isl_range_km)
    .map((p) => ({ isl: p.isl_range_km, worst: p.worst_availability_percent }));

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Чувствительность к дальности ISL</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Точный пересчёт (не аппроксимация) на каждой точке сетки. Первая проходящая
            точка по возрастанию — минимум среди проверенных значений (при допущении, что
            большая дальность ISL не ухудшает связность).
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Значения ISL, км (через запятую)</span>
            <Input value={valuesText} onChange={(e) => setValuesText(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={refine} onCheckedChange={(v) => setRefine(Boolean(v))} />
            Уточнить границу с шагом 50 км
          </label>
          <Button onClick={run} disabled={analysis.isPending}>
            {analysis.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {analysis.isPending ? "Считаем..." : "Запустить sweep"}
          </Button>
          {analysis.error && (
            <p className="text-sm text-status-bad">{analysis.error.message}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!result && !analysis.isPending && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Запустите sweep, чтобы найти минимальную дальность межспутниковой линии,
              при которой worst availability достигает target.
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            <Card>
              <CardHeader><CardTitle>Минимальная дальность ISL для target</CardTitle></CardHeader>
              <CardContent>
                {result.minimum_isl_found && result.minimum_isl_range_km != null ? (
                  <p className="text-2xl font-semibold">{result.minimum_isl_range_km} км</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Target не достигнут ни на одной из проверенных точек.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Worst availability vs дальность ISL</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeOpacity={0.15} />
                      <XAxis dataKey="isl" tick={{ fontSize: 11 }} unit=" км" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} labelFormatter={(l) => `${l} км`} />
                      <ReferenceLine
                        y={result.target_availability * 100}
                        stroke="var(--color-status-ok)"
                        strokeDasharray="4 4"
                        label={{ value: "target", fontSize: 10, position: "insideTopRight" }}
                      />
                      {result.minimum_isl_range_km != null && (
                        <ReferenceLine
                          x={result.minimum_isl_range_km}
                          stroke="var(--color-primary)"
                          strokeDasharray="4 4"
                        />
                      )}
                      <Line type="monotone" dataKey="worst" stroke="var(--color-chart-1)" dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
