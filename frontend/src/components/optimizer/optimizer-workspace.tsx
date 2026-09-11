"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorBanner } from "@/components/layout/error-banner";
import { Button } from "@/components/ui/button";
import { optimizeScenario } from "@/lib/api/analysis";
import { formatDuration, formatPercent } from "@/lib/format";
import { useAppStore } from "@/store/app-store";

const ROBUST_SCENARIOS = [
  "01_full_constellation",
  "02_first_launch",
  "03_satellite_outages",
  "04_link_range",
];

export function OptimizerWorkspace() {
  const router = useRouter();
  const selectedScenarioId = useAppStore((state) => state.selectedScenarioId);
  const uploadedScenario = useAppStore((state) => state.uploadedScenario);
  const routingStrategy = useAppStore((state) => state.routingStrategy);
  const setUploadedScenario = useAppStore((state) => state.setUploadedScenario);
  const [robust, setRobust] = useState(false);
  const optimization = useMutation({ mutationFn: optimizeScenario });

  const handleOptimize = () => {
    optimization.mutate({
      scenarioId: uploadedScenario ? undefined : selectedScenarioId,
      scenario: uploadedScenario ?? undefined,
      robustnessScenarioIds: robust && !uploadedScenario
        ? ROBUST_SCENARIOS.filter((id) => id !== selectedScenarioId)
        : [],
      routingStrategy,
    });
  };

  const applyRecommended = () => {
    if (!optimization.data) return;
    setUploadedScenario(optimization.data.recommended_scenario);
    router.push("/");
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Оптимизация RAAN / phase</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Differential Evolution меняет только углы плоскостей. Каждый кандидат проверяется эталонной геометрией на исходной сетке времени.
            </p>
          </div>
          <Button onClick={handleOptimize} disabled={optimization.isPending}>
            {optimization.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {optimization.isPending ? "Идёт точный поиск..." : "Найти варианты"}
          </Button>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <input type="checkbox" checked={robust} disabled={!!uploadedScenario} onChange={(event) => setRobust(event.target.checked)} />
          <span><span className="font-medium">Робастный поиск по четырём сценариям</span><span className="ml-2 text-muted-foreground">Медленнее, зато не оптимизирует один красивый случай.</span></span>
        </label>
        {optimization.error && <ErrorBanner error={optimization.error} />}

        {optimization.data && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["Исходный", optimization.data.baseline],
                ["Рекомендованный", optimization.data.recommended],
              ].map(([label, candidate]) => {
                const item = candidate as typeof optimization.data.recommended;
                return (
                  <section key={label as string} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-text-muted">{label as string}</p>
                    <p className="mt-2 text-2xl font-semibold">{formatPercent(item.objectives.worst_availability_percent)}</p>
                    <p className="text-xs text-muted-foreground">худший клиент · макс. перерыв {formatDuration(item.objectives.worst_max_outage_s)}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {item.angles.reduce<{ raan: number; phase: number }[]>((rows, value, index) => {
                        if (index % 2 === 0) rows.push({ raan: value, phase: item.angles[index + 1] });
                        return rows;
                      }, []).map((plane, index) => (
                        <div key={index} className="rounded bg-secondary/60 p-2 text-xs">
                          <p className="text-text-muted">P{index + 1}</p>
                          <p className="font-mono">Ω {plane.raan.toFixed(1)}°</p>
                          <p className="font-mono">φ {plane.phase.toFixed(1)}°</p>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm">Проверено кандидатов: <span className="font-mono">{optimization.data.evaluated_candidates}</span>. Исходный сценарий не изменён.</p>
              <Button onClick={applyRecommended}>Применить как новый вариант</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
