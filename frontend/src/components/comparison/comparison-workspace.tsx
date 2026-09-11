"use client";

import { useMutation } from "@tanstack/react-query";
import { GitCompareArrows, Loader2 } from "lucide-react";

import { ErrorBanner } from "@/components/layout/error-banner";
import { Button } from "@/components/ui/button";
import { compareRuns } from "@/lib/api/analysis";
import { formatDuration, formatPercent } from "@/lib/format";
import { useAppStore } from "@/store/app-store";

export function ComparisonWorkspace() {
  const history = useAppStore((state) => state.runHistory);
  const comparison = useMutation({ mutationFn: compareRuns });
  const orderedRuns = [...history].reverse();

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Сравнение вариантов</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Первый запуск считается базовым; все изменения и метрики сравниваются на одной сетке.
            </p>
          </div>
          <Button
            onClick={() => comparison.mutate(orderedRuns.map((run) => run.run_id))}
            disabled={history.length < 2 || comparison.isPending}
          >
            {comparison.isPending ? <Loader2 className="animate-spin" /> : <GitCompareArrows />}
            Сравнить {history.length} запуска
          </Button>
        </div>

        {history.length < 2 && (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Запустите минимум два варианта — например исходный и оптимизированный.
          </div>
        )}
        {comparison.error && <ErrorBanner error={comparison.error} />}

        {comparison.data && (
          <div className="grid gap-4 lg:grid-cols-2">
            {comparison.data.variants.map((variant, index) => (
              <section key={variant.run_id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{variant.scenario_title ?? variant.scenario_id}</p>
                    <p className="font-mono text-[10px] text-text-muted">{variant.run_id}</p>
                  </div>
                  <span className="rounded bg-secondary px-2 py-1 text-[10px] text-muted-foreground">
                    {index === 0 ? "База" : `${variant.changed_parameters.length} изм.`}
                  </span>
                </div>
                <div className="space-y-2">
                  {Object.entries(variant.metrics).map(([clientId, metrics]) => {
                    const delta = variant.deltas_from_baseline[clientId];
                    return (
                      <div key={clientId} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-lg bg-secondary/45 p-3">
                        <span className="font-mono text-xs">{clientId}</span>
                        <div>
                          <p className="font-mono text-sm">{formatPercent(metrics.availability_percent)}</p>
                          <p className="text-[11px] text-muted-foreground">перерыв {formatDuration(metrics.max_outage_s)}</p>
                        </div>
                        <div className="text-right font-mono text-xs">
                          <p className={delta.availability_percent >= 0 ? "text-status-ok" : "text-status-bad"}>
                            {delta.availability_percent >= 0 ? "+" : ""}{delta.availability_percent.toFixed(2)} п.п.
                          </p>
                          <p className="text-text-muted">{delta.max_outage_s >= 0 ? "+" : ""}{delta.max_outage_s} с</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
