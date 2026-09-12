"use client";

import { Loader2, Play, Wallet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useEconomics } from "@/hooks/use-economics";
import { useAppStore } from "@/store/app-store";
import { HISTORICAL_COST_PRESET } from "@/types/economics";
import type { Scenario } from "@/types/scenario";

function rub(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

export function EconomicsPanel({ scenario }: { scenario: Scenario }) {
  const estimate = useEconomics();
  const cost = useAppStore((s) => s.cost);
  const setCostMode = useAppStore((s) => s.setCostMode);
  const setCostAssumptions = useAppStore((s) => s.setCostAssumptions);

  const totalSatellites = scenario.design.satellites.length;
  const deployedSatellites = scenario.design.satellites.filter(
    (satellite) => satellite.launch_batch <= scenario.design.launch_stage,
  );
  const [satelliteCount, setSatelliteCount] = useState(String(deployedSatellites.length));
  const [launchBatches, setLaunchBatches] = useState(
    String(new Set(deployedSatellites.map((satellite) => satellite.launch_batch)).size),
  );
  const capacity = cost.assumptions.launch_capacity_satellites;
  const validationError = (() => {
    if (!satelliteCount || !Number.isInteger(Number(satelliteCount)) ||
        Number(satelliteCount) < 1 || Number(satelliteCount) > totalSatellites) {
      return `Укажите целое число спутников от 1 до ${totalSatellites}.`;
    }
    if (!launchBatches || !Number.isInteger(Number(launchBatches)) || Number(launchBatches) < 1) {
      return "Укажите целое число партий, не меньше 1.";
    }
    if (capacity != null && (!Number.isInteger(capacity) || capacity < 1)) {
      return "Вместимость пуска должна быть целым числом, не меньше 1.";
    }
    if (cost.mode === "cost") {
      if (cost.assumptions.satellite_unit_cost_rub == null) {
        return "Для денежной оценки укажите стоимость аппарата.";
      }
      const amounts = [cost.assumptions.satellite_unit_cost_rub,
        cost.assumptions.launch_fixed_cost_rub ?? 0,
        cost.assumptions.integration_cost_rub, cost.assumptions.reserve_percent];
      if (amounts.some((value) => !Number.isFinite(value) || value < 0)) {
        return "Стоимость и резерв должны быть конечными неотрицательными числами.";
      }
    }
    return null;
  })();

  const applyHistoricalPreset = () => {
    setCostAssumptions({
      satellite_unit_cost_rub: HISTORICAL_COST_PRESET.satellite_unit_cost_rub,
      launch_fixed_cost_rub: HISTORICAL_COST_PRESET.launch_fixed_cost_rub,
      launch_capacity_satellites: HISTORICAL_COST_PRESET.launch_capacity_satellites,
      source_label: HISTORICAL_COST_PRESET.label,
    });
    setCostMode("cost");
  };

  const request = {
    satellite_count: Number(satelliteCount),
    total_satellites: totalSatellites,
    launch_batches_used: Number(launchBatches),
    satellite_unit_cost_rub:
      cost.mode === "cost" ? cost.assumptions.satellite_unit_cost_rub : null,
    launch_fixed_cost_rub: cost.mode === "cost" ? cost.assumptions.launch_fixed_cost_rub : null,
    launch_capacity_satellites: capacity,
    integration_cost_rub: cost.mode === "cost" ? cost.assumptions.integration_cost_rub : 0,
    reserve_percent: cost.mode === "cost" ? cost.assumptions.reserve_percent : 0,
    source_label: cost.mode === "cost" ? cost.assumptions.source_label : null,
  };
  const run = () => {
    if (!validationError) estimate.mutate(request);
  };

  const isCurrent = JSON.stringify(estimate.variables) === JSON.stringify(request);
  const result = isCurrent && !validationError && !estimate.isPending && !estimate.isError ? estimate.data : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Ресурсы и экономика</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Рассчитайте долю развёрнутой группировки и необходимое число пусков.
            Вместимость пуска можно указать без цен. Денежная оценка включается отдельно.
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Число развёрнутых спутников</span>
            <Input
              type="number"
              min={1}
              max={totalSatellites}
              step={1}
              value={satelliteCount}
              onChange={(e) => setSatelliteCount(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Число партий развёртывания</span>
            <Input
              type="number"
              min={1}
              step={1}
              value={launchBatches}
              onChange={(e) => setLaunchBatches(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Начальные значения взяты из очереди выбранного сценария. Партия — этап
            развёртывания, не обязательно отдельный физический пуск.
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Вместимость пуска, аппаратов</span>
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Например, 16"
              value={capacity ?? ""}
              onChange={(e) => setCostAssumptions({
                launch_capacity_satellites: e.target.value ? Number(e.target.value) : null,
              })}
            />
            <span className="text-xs text-muted-foreground">
              Необязательно. Нужно для расчёта числа пусков; цена пуска не требуется.
            </span>
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
              {cost.assumptions.source_label && (
                <p className="rounded-md bg-secondary p-2 text-[11px] leading-relaxed text-muted-foreground">
                  Источник: {cost.assumptions.source_label}. {HISTORICAL_COST_PRESET.note}
                </p>
              )}
            </div>
          )}

          <Button onClick={run} disabled={estimate.isPending || !!validationError}>
            {estimate.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {estimate.isPending ? "Считаем..." : "Рассчитать"}
          </Button>
          {validationError && <p role="alert" className="text-sm text-status-bad">{validationError}</p>}
          {estimate.error && isCurrent && (
            <p className="text-sm text-status-bad">{estimate.error.message}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {estimate.isPending && <p role="status" className="text-sm text-muted-foreground">Рассчитываем ресурсы…</p>}
        {!result && !estimate.isPending && (
          <EmptyState
            icon={Wallet}
            title={estimate.data ? "Параметры изменены — нужен новый расчёт" : "Ресурсы ещё не рассчитаны"}
            description="Проверьте параметры слева и нажмите «Рассчитать». Для оценки числа пусков задайте вместимость; цены в режиме «Только ресурсы» не нужны."
          />
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
                  <p className="text-xs text-muted-foreground">Партий задано</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {result.resources.launch_batches_used}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Необходимо пусков</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {result.resources.estimated_launches ?? "—"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {result.resources.estimated_launches != null
                      ? `${result.resources.satellite_count} аппаратов / ${estimate.variables?.launch_capacity_satellites} за пуск, округление вверх`
                      : "Задайте вместимость пуска и повторите расчёт."}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Ресурсный расчёт выполнен</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm" aria-live="polite">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Развёрнуто от полного состава</span>
                  <span>{(result.resources.satellite_count / result.resources.total_satellites * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Осталось развернуть аппаратов</span>
                  <span>{result.resources.total_satellites - result.resources.satellite_count}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Число пусков — нижняя оценка по вместимости. Ограничения выведения на
                  разные орбитальные плоскости здесь не учитываются.
                  {result.mode === "resource_only" && " Денежные затраты не рассчитываются в режиме «Только ресурсы»."}
                </p>
              </CardContent>
            </Card>

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
