"use client";

import { useExamples } from "@/hooks/use-examples";
import { HelpTip } from "@/components/ui/help-tip";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import { useAppStore } from "@/store/app-store";
import type { RoutingStrategy } from "@/types/simulation";

const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
  maximum_margin: "Максимальный запас",
  maximum_persistence: "Максимальная стабильность",
};

function ContextRow() {
  const { data: examples } = useExamples();
  const scenarioId = useAppStore((s) => s.selectedScenarioId);
  const uploadedScenario = useAppStore((s) => s.uploadedScenario);
  const routingStrategy = useAppStore((s) => s.routingStrategy);
  const example = examples?.find((e) => e.id === scenarioId);

  const scenarioLabel = uploadedScenario
    ? uploadedScenario.meta.id
    : example
      ? scenarioDisplayTitle(example.id, example.title)
      : "—";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-muted">Сценарий <HelpTip>Исходная конфигурация аппаратов, орбит, наземных пунктов и ограничений связи.</HelpTip></span>
        <span className="font-medium text-foreground">{scenarioLabel}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-muted">Стратегия <HelpTip>Правило, по которому расчёт выбирает один маршрут из всех допустимых.</HelpTip></span>
        <span className="font-medium text-foreground">{STRATEGY_LABELS[routingStrategy]}</span>
      </span>
    </div>
  );
}

/**
 * Compact page-level header used on every route except Simulation (which
 * has its own richer header with scenario/strategy pickers). Deliberately
 * NOT a hero section — one title line, one description line, one context
 * row — this is engineering software, not a marketing page.
 */
export function PageHeader({
  title,
  description,
  showContext = true,
}: {
  title: string;
  description?: string;
  showContext?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Аналитический модуль</p>
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {showContext && <ContextRow />}
    </div>
  );
}
