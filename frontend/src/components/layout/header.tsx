"use client";

import { Download, FileBarChart, GitCompareArrows, Loader2, MoreVertical, Play, SlidersHorizontal, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { AboutDialog } from "@/components/layout/about-dialog";
import { BackendStatus } from "@/components/layout/backend-status";
import { ErrorBanner } from "@/components/layout/error-banner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SimulationStatus } from "@/components/simulation/simulation-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExamples } from "@/hooks/use-examples";
import { useExportRun } from "@/hooks/use-export-run";
import { useUploadScenario } from "@/hooks/use-upload-scenario";
import { scenarioDescription, scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
  maximum_margin: "Максимальный запас",
  maximum_persistence: "Максимальная стабильность",
};

const STRATEGY_DESCRIPTIONS: Record<RoutingStrategy, string> = {
  minimum_hops: "Меньше промежуточных узлов",
  minimum_distance: "Меньше суммарная длина линии",
  maximum_margin: "Устойчивее к деградации самого слабого участка",
  maximum_persistence: "Дольше сохраняется при известной динамике сети",
};

export function Header({
  runId,
  onRun,
  isRunPending,
  runError,
}: {
  runId: string | null;
  onRun: () => void;
  isRunPending: boolean;
  runError: unknown;
}) {
  const { data: examples } = useExamples();
  const selectedScenarioId = useAppStore((s) => s.selectedScenarioId);
  const selectExampleScenario = useAppStore((s) => s.selectExampleScenario);
  const uploadedScenario = useAppStore((s) => s.uploadedScenario);
  const setUploadedScenario = useAppStore((s) => s.setUploadedScenario);
  const routingStrategy = useAppStore((s) => s.routingStrategy);
  const setRoutingStrategy = useAppStore((s) => s.setRoutingStrategy);
  const upload = useUploadScenario();
  const exportRun = useExportRun();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedExample = examples?.find((e) => e.id === selectedScenarioId);
  const setCalculationInspectorOpen = useAppStore((s) => s.setCalculationInspectorOpen);
  const setSummaryOpen = useAppStore((s) => s.setSummaryOpen);
  const queueForComparison = useAppStore((s) => s.queueForComparison);
  const router = useRouter();

  const handleUploadClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file, { onSuccess: setUploadedScenario });
    e.target.value = "";
  };

  const anyError = runError ?? upload.error ?? exportRun.error;

  return (
    <div className="app-topbar border-b border-border bg-background lg:ml-60">
      <header className="flex min-h-[73px] flex-wrap items-center gap-3 px-4 py-2 sm:px-5 xl:flex-nowrap">
        <div className="flex min-w-[150px] flex-col leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary lg:hidden">NORD-48</p>
          <h1 className="text-[17px] font-bold tracking-tight text-foreground">Моделирование сети</h1>
          <p className="text-[11px] text-muted-foreground">Сценарий, геометрия и маршруты</p>
        </div>

        <div className="hidden 2xl:block"><AboutDialog /></div>

        <div className="flex flex-1 items-center gap-2 xl:justify-center">
          {uploadedScenario ? (
            <Badge variant="secondary" className="h-9 gap-1.5 px-3">
              Загружен: {uploadedScenario.meta.id}
              <button
                type="button"
                onClick={() => selectExampleScenario(selectedScenarioId)}
                className="ml-1 text-muted-foreground hover:text-foreground"
                title="Вернуться к готовым сценариям"
              >
                ✕
              </button>
            </Badge>
          ) : (
            <Select value={selectedScenarioId} onValueChange={selectExampleScenario}>
              <SelectTrigger className="w-52 bg-card shadow-sm" aria-label="Расчётный сценарий" title="Исходная конфигурация группировки и условий связи">
                <SelectValue placeholder="Сценарий">
                  {selectedExample
                    ? scenarioDisplayTitle(selectedExample.id, selectedExample.title)
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" align="start" sideOffset={8}>
                {examples?.map((example) => (
                  <SelectItem key={example.id} value={example.id}>
                    <span className="flex flex-col py-0.5">
                      <span>{scenarioDisplayTitle(example.id, example.title)}</span>
                      {scenarioDescription(example.id) && (
                        <span className="text-xs text-muted-foreground">
                          {scenarioDescription(example.id)}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={routingStrategy}
            onValueChange={(v) => setRoutingStrategy(v as RoutingStrategy)}
          >
            <SelectTrigger className="w-48 bg-card shadow-sm" aria-label="Стратегия маршрутизации" title="Правило выбора маршрута между наземным пунктом и шлюзом">
              <SelectValue>{STRATEGY_LABELS[routingStrategy]}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" side="bottom" align="start" sideOffset={8}>
              {(["minimum_hops", "minimum_distance", "maximum_margin", "maximum_persistence"] as const).map((strategy) => (
                <SelectItem key={strategy} value={strategy}>
                  <span className="flex flex-col py-0.5">
                    <span>{STRATEGY_LABELS[strategy]}</span>
                    <span className="text-xs text-muted-foreground">
                      {STRATEGY_DESCRIPTIONS[strategy]}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button variant="outline" size="sm" className="bg-card shadow-sm" onClick={handleUploadClick} disabled={upload.isPending} aria-label="Загрузить сценарий из JSON">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">Загрузить JSON</span>
          </Button>

          <Button size="sm" onClick={onRun} disabled={isRunPending}>
            {isRunPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {isRunPending ? "Выполняется..." : "Запустить расчёт"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!runId} aria-label="Дополнительные действия с расчётом">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setCalculationInspectorOpen(true)}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Расчёт
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSummaryOpen(true)}>
                <FileBarChart className="h-3.5 w-3.5" />
                Сводка расчёта
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!runId) return;
                  queueForComparison(runId);
                  router.push("/compare");
                }}
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
                Добавить в сравнение
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => runId && exportRun.mutate(runId)}
                disabled={exportRun.isPending}
              >
                <Download className="h-3.5 w-3.5" />
                Экспорт результата JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <BackendStatus />
          <div className="lg:hidden"><ThemeToggle /></div>
        </div>
      </header>

      <SimulationStatus
        pending={isRunPending}
        horizonS={uploadedScenario?.environment.horizon_s ?? selectedExample?.horizon_s}
        stepS={uploadedScenario?.environment.step_s ?? selectedExample?.step_s}
      />

      {anyError ? (
        <div className="px-4 pb-3">
          <ErrorBanner error={anyError} />
        </div>
      ) : null}
    </div>
  );
}
