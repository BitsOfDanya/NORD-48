"use client";

import type { ReactNode } from "react";

import { ErrorBanner } from "@/components/layout/error-banner";
import { useExamples } from "@/hooks/use-examples";
import { scenarioDescription, scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {title}
      </p>
      {children}
    </div>
  );
}

export function ScenarioPanel() {
  const { data: examples, isError, error } = useExamples();
  const selectedScenarioId = useAppStore((s) => s.selectedScenarioId);
  const uploadedScenario = useAppStore((s) => s.uploadedScenario);

  const selectedExample = examples?.find((e) => e.id === selectedScenarioId);

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
    <div className="flex flex-col gap-4 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        Конфигурация
      </p>

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

          <StatGroup title="Развёртывание">
            <StatRow label="Этап" value={`${params.launch_stage} / 3`} />
          </StatGroup>

          <StatGroup title="Орбита">
            <StatRow label="Высота" value={`${params.altitude_km} км`} />
            <StatRow label="Наклонение" value={`${params.inclination_deg}°`} />
            <StatRow label="Мин. угол возвышения" value={`${params.min_elevation_deg}°`} />
          </StatGroup>

          <StatGroup title="Связь">
            <StatRow label="Дальность ISL" value={`${params.isl_range_km} км`} />
            <StatRow
              label="Целевая доступность"
              value={`${Math.round(params.target_availability * 100)}%`}
            />
          </StatGroup>

          <StatGroup title="Группировка">
            <StatRow label="Плоскостей" value={String(params.plane_count)} />
            <StatRow label="Спутников" value={String(params.satellite_count)} />
          </StatGroup>

          <StatGroup title="Наземная сеть">
            <StatRow label="Наземных пунктов" value={String(params.client_count)} />
            <StatRow label="Шлюзов" value={String(params.gateway_count)} />
          </StatGroup>
        </>
      )}
    </div>
  );
}
