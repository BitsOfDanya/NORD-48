"use client";

import { Loader2, Play, Upload } from "lucide-react";
import { useRef } from "react";

import { BackendStatus } from "@/components/layout/backend-status";
import { ErrorBanner } from "@/components/layout/error-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExamples } from "@/hooks/use-examples";
import { useRunSimulation } from "@/hooks/use-run-simulation";
import { useUploadScenario } from "@/hooks/use-upload-scenario";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
};

export function Header() {
  const { data: examples } = useExamples();
  const selectedScenarioId = useAppStore((s) => s.selectedScenarioId);
  const selectExampleScenario = useAppStore((s) => s.selectExampleScenario);
  const uploadedScenario = useAppStore((s) => s.uploadedScenario);
  const setUploadedScenario = useAppStore((s) => s.setUploadedScenario);
  const routingStrategy = useAppStore((s) => s.routingStrategy);
  const setRoutingStrategy = useAppStore((s) => s.setRoutingStrategy);
  const runSimulation = useRunSimulation();
  const upload = useUploadScenario();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRun = () => {
    if (uploadedScenario) {
      runSimulation.mutate({ scenario: uploadedScenario, routingStrategy });
    } else {
      runSimulation.mutate({ scenarioId: selectedScenarioId, routingStrategy });
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file, { onSuccess: setUploadedScenario });
    e.target.value = "";
  };

  const anyError = runSimulation.error ?? upload.error;

  return (
    <div className="border-b border-border bg-sidebar">
      <header className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <div className="flex flex-col leading-tight">
          <h1 className="text-base font-semibold tracking-wide text-foreground">NORD-48</h1>
          <p className="text-[11px] text-muted-foreground">
            Проектирование • Маршрутизация • Анализ устойчивости
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Сценарий" />
              </SelectTrigger>
              <SelectContent>
                {examples?.map((example) => (
                  <SelectItem key={example.id} value={example.id}>
                    {scenarioDisplayTitle(example.id, example.title)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={routingStrategy}
            onValueChange={(v) => setRoutingStrategy(v as RoutingStrategy)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimum_hops">{STRATEGY_LABELS.minimum_hops}</SelectItem>
              <SelectItem value="minimum_distance">{STRATEGY_LABELS.minimum_distance}</SelectItem>
            </SelectContent>
          </Select>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button variant="outline" onClick={handleUploadClick} disabled={upload.isPending}>
            <Upload className="h-4 w-4" />
            Загрузить JSON
          </Button>

          <Button onClick={handleRun} disabled={runSimulation.isPending}>
            {runSimulation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {runSimulation.isPending ? "Расчёт..." : "Запустить расчёт"}
          </Button>

          <BackendStatus />
        </div>
      </header>

      {runSimulation.isPending && (
        <div className="px-4 pb-2 text-xs text-muted-foreground">
          Выполняется расчёт 720 состояний сети
        </div>
      )}

      {anyError ? (
        <div className="px-4 pb-3">
          <ErrorBanner error={anyError} />
        </div>
      ) : null}
    </div>
  );
}
