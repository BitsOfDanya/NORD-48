"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEconomics } from "@/hooks/use-economics";
import { useAppStore } from "@/store/app-store";
import { HISTORICAL_COST_PRESET } from "@/types/economics";

function rub(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

export function EconomicsPanel({ totalSatellites }: { totalSatellites: number }) {
  const estimate = useEconomics();
  const cost = useAppStore((s) => s.cost);
  const setCostMode = useAppStore((s) => s.setCostMode);
  const setCostAssumptions = useAppStore((s) => s.setCostAssumptions);

  const [satelliteCount, setSatelliteCount] = useState(totalSatellites);
  const [launchBatches, setLaunchBatches] = useState(1);

  const applyHistoricalPreset = () => {
    setCostAssumptions({
      satellite_unit_cost_rub: HISTORICAL_COST_PRESET.satellite_unit_cost_rub,
      launch_fixed_cost_rub: HISTORICAL_COST_PRESET.launch_fixed_cost_rub,
      launch_capacity_satellites: HISTORICAL_COST_PRESET.launch_capacity_satellites,
      source_label: HISTORICAL_COST_PRESET.label,
    });
    setCostMode("cost");
  };

  const run = () => {
    estimate.mutate({
      satellite_count: satelliteCount,
      total_satellites: totalSatellites,
      launch_batches_used: launchBatches,
      satellite_unit_cost_rub:
        cost.mode === "cost" ? cost.assumptions.satellite_unit_cost_rub : null,
      launch_fixed_cost_rub: cost.mode === "cost" ? cost.assumptions.launch_fixed_cost_rub : null,
      launch_capacity_satellites:
        cost.mode === "cost" ? cost.assumptions.launch_capacity_satellites : null,
      integration_cost_rub: cost.mode === "cost" ? cost.assumptions.integration_cost_rub : 0,
      reserve_percent: cost.mode === "cost" ? cost.assumptions.reserve_percent : 0,
      source_label: cost.mode === "cost" ? cost.assumptions.source_label : null,
    });
  };

  const result = estimate.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Ресурсы и экономика</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            По умолчанию показываются только ресурсные числа (сколько спутников, сколько
            пусков) — без единого «спрятанного» коэффициента цены. Денежная оценка — только
            если вы явно укажете стоимость аппарата.
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Число активных спутников</span>
            <Input
              type="number"
              value={satelliteCount}
              onChange={(e) => setSatelliteCount(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Число пусков (партий)</span>
            <Input
              type="number"
              value={launchBatches}
              onChange={(e) => setLaunchBatches(Number(e.target.value))}
            />
          </label>

          <div className="flex gap-2 rounded-md bg-secondary p-1">
            <button
              type="button"
              onClick={() => setCostMode("resource")}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${cost.mode === "resource" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Только ресурсы
            </button>
            <button
              type="button"
              onClick={() => setCostMode("cost")}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${cost.mode === "cost" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              С оценкой стоимости
            </button>
          </div>

          {cost.mode === "cost" && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <Button size="xs" variant="outline" onClick={applyHistoricalPreset}>
                Применить историческую оценку (Sitronics, 2021)
              </Button>
              <label className="flex flex-col gap-1.5 text-xs">
                <span>Стоимость аппарата, ₽</span>
                <Input
                  type="number"
                  value={cost.assumptions.satellite_unit_cost_rub ?? ""}
                  onChange={(e) =>
                    setCostAssumptions({
                      satellite_unit_cost_rub: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs">
                <span>Стоимость пуска, ₽</span>
                <Input
                  type="number"
                  value={cost.assumptions.launch_fixed_cost_rub ?? ""}
                  onChange={(e) =>
                    setCostAssumptions({
                      launch_fixed_cost_rub: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs">
                <span>Вместимость пуска, аппаратов</span>
                <Input
                  type="number"
                  value={cost.assumptions.launch_capacity_satellites ?? ""}
                  onChange={(e) =>
                    setCostAssumptions({
                      launch_capacity_satellites: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              {cost.assumptions.source_label && (
                <p className="rounded-md bg-secondary p-2 text-[11px] leading-relaxed text-muted-foreground">
                  Источник: {cost.assumptions.source_label}. {HISTORICAL_COST_PRESET.note}
                </p>
              )}
            </div>
          )}

          <Button onClick={run} disabled={estimate.isPending}>
            {estimate.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {estimate.isPending ? "Считаем..." : "Оценить"}
          </Button>
          {estimate.error && (
            <p className="text-sm text-status-bad">{estimate.error.message}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!result && !estimate.isPending && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Укажите число спутников и пусков и запустите оценку.
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Спутников</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {result.resources.satellite_count}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}из {result.resources.total_satellites}
                    </span>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Пусков использовано</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {result.resources.launch_batches_used}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Оценка пусков</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {result.resources.estimated_launches ?? "—"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {result.mode === "resource_only" && (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Денежная оценка не запрошена (режим «только ресурсы»). Чтобы увидеть оценку в
                  рублях, укажите стоимость аппарата в режиме «с оценкой стоимости».
                </CardContent>
              </Card>
            )}

            {result.cost && (
              <Card>
                <CardHeader><CardTitle>Оценка стоимости</CardTitle></CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Спутники</span>
                    <span className="font-mono">{rub(result.cost.estimated_satellite_cost_rub)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Пуски ({result.cost.estimated_launches ?? "—"})</span>
                    <span className="font-mono">{rub(result.cost.estimated_launch_cost_rub)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Интеграция</span>
                    <span className="font-mono">{rub(result.cost.integration_cost_rub)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Резерв ({result.cost.reserve_percent}%)</span>
                    <span className="font-mono">
                      {rub(result.cost.estimated_total_rub - (result.cost.estimated_satellite_cost_rub + result.cost.estimated_launch_cost_rub + result.cost.integration_cost_rub))}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                    <span>Итого</span>
                    <span className="font-mono">{rub(result.cost.estimated_total_rub)}</span>
                  </div>
                  {result.cost_per_availability_point_rub != null && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      ≈ {rub(result.cost_per_availability_point_rub)} за 1 п.п. worst availability
                    </p>
                  )}
                  {result.cost.source_label && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Источник допущений: {result.cost.source_label}. Ориентировочно, не
                      коммерческое предложение.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
