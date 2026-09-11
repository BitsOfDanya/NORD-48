"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { ErrorBanner } from "@/components/layout/error-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExamples } from "@/hooks/use-examples";
import { getExample } from "@/lib/api/scenarios";
import { scenarioDescription, scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-secondary/50 px-2.5 py-2">
      <span className="font-mono text-base font-semibold leading-none text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

export function ScenarioPanel() {
  const { data: examples, isError, error } = useExamples();
  const selectedScenarioId = useAppStore((s) => s.selectedScenarioId);
  const uploadedScenario = useAppStore((s) => s.uploadedScenario);
  const setUploadedScenario = useAppStore((s) => s.setUploadedScenario);
  const [failureSatelliteId, setFailureSatelliteId] = useState("S01");
  const [failureStartS, setFailureStartS] = useState(21600);
  const [failureEndS, setFailureEndS] = useState(86400);

  const selectedExample = examples?.find((e) => e.id === selectedScenarioId);

  const updateDraft = (change: (draft: NonNullable<typeof uploadedScenario>) => void) => {
    if (!uploadedScenario) return;
    const draft = structuredClone(uploadedScenario);
    change(draft);
    setUploadedScenario(draft);
  };

  const createEditableCopy = async () => {
    const source = await getExample(selectedScenarioId);
    source.meta = {
      ...source.meta,
      id: `${source.meta.id}_variant`,
      title: `${source.meta.title ?? source.meta.id} — вариант`,
    };
    setFailureEndS(source.environment.horizon_s);
    setUploadedScenario(source);
  };

  const params = uploadedScenario
    ? {
        title: uploadedScenario.meta.id,
        description: undefined,
        launch_stage: uploadedScenario.design.launch_stage,
        altitude_km: uploadedScenario.environment.altitude_km,
        inclination_deg: uploadedScenario.environment.inclination_deg,
        isl_range_km: uploadedScenario.environment.isl_range_km,
        min_elevation_deg: uploadedScenario.environment.min_elevation_deg,
        target_availability: uploadedScenario.environment.target_availability,
        plane_count: uploadedScenario.design.planes.length,
        satellite_count: uploadedScenario.design.satellites.length,
        client_count: uploadedScenario.ground_sites.filter((g) => g.role === "client").length,
        gateway_count: uploadedScenario.ground_sites.filter((g) => g.role === "gateway").length,
      }
    : selectedExample
      ? {
          title: scenarioDisplayTitle(selectedExample.id, selectedExample.title),
          description: scenarioDescription(selectedExample.id),
          launch_stage: selectedExample.launch_stage,
          altitude_km: selectedExample.altitude_km,
          inclination_deg: selectedExample.inclination_deg,
          isl_range_km: selectedExample.isl_range_km,
          min_elevation_deg: selectedExample.min_elevation_deg,
          target_availability: selectedExample.target_availability,
          plane_count: 3,
          satellite_count: 48,
          client_count: 3,
          gateway_count: 1,
        }
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Конфигурация</p>

      {isError && <ErrorBanner error={error} />}

      {!params && (
        <p className="text-sm text-muted-foreground">Выберите сценарий, чтобы увидеть параметры.</p>
      )}

      {params && (
        <>
          <div>
            <p className="text-sm font-medium text-foreground">{params.title}</p>
            {params.description && (
              <p className="text-xs text-muted-foreground">{params.description}</p>
            )}
          </div>

          <StatGroup title="Группировка">
            <StatBlock value={String(params.satellite_count)} label="аппаратов" />
            <StatBlock value={String(params.plane_count)} label="плоскости" />
            <StatBlock value={`${params.launch_stage} / 3`} label="этап" />
          </StatGroup>

          <StatGroup title="Орбита">
            <StatBlock value={`${params.altitude_km} км`} label="высота" />
            <StatBlock value={`${params.inclination_deg}°`} label="наклонение" />
          </StatGroup>

          <StatGroup title="Связь">
            <StatBlock value={`${params.isl_range_km} км`} label="ISL" />
            <StatBlock value={`${params.min_elevation_deg}°`} label="мин. угол" />
            <StatBlock value={`${Math.round(params.target_availability * 100)}%`} label="цель" />
          </StatGroup>

          <StatGroup title="Наземная сеть">
            <StatBlock value={String(params.client_count)} label="пунктов" />
            <StatBlock value={String(params.gateway_count)} label="шлюз" />
          </StatGroup>

          {!uploadedScenario ? (
            <Button variant="outline" className="w-full" onClick={createEditableCopy}>
              Создать редактируемую копию
            </Button>
          ) : (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Проектные параметры</p>
              <label className="space-y-1 text-xs text-muted-foreground">
                Этап развёртывания
                <Select
                  value={String(uploadedScenario.design.launch_stage)}
                  onValueChange={(value) => updateDraft((draft) => { draft.design.launch_stage = Number(value); })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((stage) => <SelectItem key={stage} value={String(stage)}>{stage}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              {uploadedScenario.design.planes.map((plane, index) => (
                <div key={plane.id} className="rounded-lg bg-secondary/45 p-2.5">
                  <p className="mb-2 font-mono text-xs text-primary">{plane.id}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-[10px] text-muted-foreground">RAAN, °
                      <Input type="number" min={0} max={359.999} step={0.5} value={plane.raan_deg} onChange={(event) => updateDraft((draft) => { draft.design.planes[index].raan_deg = Number(event.target.value); })} />
                    </label>
                    <label className="space-y-1 text-[10px] text-muted-foreground">Phase, °
                      <Input type="number" min={0} max={359.999} step={0.5} value={plane.phase_deg} onChange={(event) => updateDraft((draft) => { draft.design.planes[index].phase_deg = Number(event.target.value); })} />
                    </label>
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-border p-2.5">
                <p className="mb-2 text-xs font-medium">Добавить отказ</p>
                <Select value={failureSatelliteId} onValueChange={setFailureSatelliteId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {uploadedScenario.design.satellites.map((satellite) => <SelectItem key={satellite.id} value={satellite.id}>{satellite.id}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[10px] text-muted-foreground">Начало, с<Input type="number" min={0} max={uploadedScenario.environment.horizon_s - 1} value={failureStartS} onChange={(event) => setFailureStartS(Number(event.target.value))} /></label>
                  <label className="space-y-1 text-[10px] text-muted-foreground">Конец, с<Input type="number" min={1} max={uploadedScenario.environment.horizon_s} value={failureEndS} onChange={(event) => setFailureEndS(Number(event.target.value))} /></label>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 w-full"
                  disabled={failureStartS >= failureEndS}
                  onClick={() => updateDraft((draft) => { draft.failures.push({ satellite_id: failureSatelliteId, start_s: failureStartS, end_s: failureEndS }); })}
                >
                  Добавить период
                </Button>
                {uploadedScenario.failures.length > 0 && <p className="mt-2 text-[10px] text-muted-foreground">Периодов отказа: {uploadedScenario.failures.length}</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
