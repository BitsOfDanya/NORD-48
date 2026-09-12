"use client";

import type { ReactNode } from "react";

import { ErrorBanner } from "@/components/layout/error-banner";
import { VariantEditor } from "@/components/simulation/variant-editor";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { useExamples } from "@/hooks/use-examples";
import { scenarioDescription, scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";

function StatBlock({ value, label, help }: { value: string; label: string; help?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-secondary/50 px-2.5 py-2">
      <span className="font-mono text-base font-semibold leading-none text-foreground tabular-nums">
        {value}
      </span>
      <span className="flex items-center gap-1 text-[11px] leading-none text-muted-foreground">
        {label}{help && <HelpTip className="size-4" label={`Что означает «${label}»`}>{help}</HelpTip>}
      </span>
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
  const savedVariants = useAppStore((s) => s.savedVariants);
  const deleteVariant = useAppStore((s) => s.deleteVariant);

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
            <StatBlock value={`${params.isl_range_km} км`} label="дальность ISL" help="Максимальная дальность межспутниковой линии связи. Контакты дальше этого порога исключаются." />
            <StatBlock value={`${params.min_elevation_deg}°`} label="мин. угол" help="Минимальный угол места спутника над горизонтом наземного пункта." />
            <StatBlock value={`${Math.round(params.target_availability * 100)}%`} label="целевая доступность" help="Минимальная допустимая доля времени с рабочим маршрутом до шлюза." />
          </StatGroup>

          <StatGroup title="Наземная сеть">
            <StatBlock value={String(params.client_count)} label="пунктов" />
            <StatBlock value={String(params.gateway_count)} label="шлюзов" help="Шлюз соединяет спутниковую сеть с внешней наземной инфраструктурой." />
          </StatGroup>

          <VariantEditor exampleId={selectedScenarioId} source={uploadedScenario} />

          {Object.keys(savedVariants).length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                Мои варианты
              </p>
              {Object.entries(savedVariants).map(([name, variant]) => (
                <div key={name} className="flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    className="truncate text-left text-foreground hover:text-primary"
                    onClick={() => setUploadedScenario(variant)}
                    title="Использовать в моделировании"
                  >
                    {name}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => deleteVariant(name)}
                    aria-label={`Удалить ${name}`}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
