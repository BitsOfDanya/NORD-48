"use client";

import { AboutDialog } from "@/components/layout/about-dialog";
import { BackendStatus } from "@/components/layout/backend-status";
import { ErrorBanner } from "@/components/layout/error-banner";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { MonteCarloForm } from "@/components/resilience/monte-carlo-form";
import { MonteCarloResults } from "@/components/resilience/monte-carlo-results";
import { useMonteCarlo } from "@/hooks/use-monte-carlo";
import { useAppStore } from "@/store/app-store";

export default function ResiliencePage() {
  const selectedScenarioId = useAppStore((s) => s.selectedScenarioId);
  const monteCarlo = useMonteCarlo();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="border-b border-border bg-background">
        <header className="flex h-16 items-center gap-4 px-4">
          <div className="flex flex-col leading-tight">
            <h1 className="text-[15px] font-semibold tracking-wide text-foreground">NORD-48</h1>
            <p className="text-[11px] text-muted-foreground">Анализ устойчивости к отказам</p>
          </div>
          <AboutDialog />
          <div className="ml-auto">
            <BackendStatus />
          </div>
        </header>
      </div>
      <WorkspaceNav />

      <div className="flex-1 overflow-y-auto bg-workspace">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_1fr]">
          <div className="lg:sticky lg:top-4 lg:self-start">
            <MonteCarloForm
              onSubmit={(request) => monteCarlo.mutate(request)}
              isPending={monteCarlo.isPending}
              defaultScenarioId={selectedScenarioId}
            />
          </div>

          <div className="flex flex-col gap-4">
            {monteCarlo.error ? <ErrorBanner error={monteCarlo.error} /> : null}

            {!monteCarlo.data && !monteCarlo.isPending && !monteCarlo.error && (
              <p className="pt-8 text-center text-sm text-muted-foreground">
                Настройте параметры и запустите стресс-тест, чтобы увидеть устойчивость
                группировки к случайным отказам спутников.
              </p>
            )}

            {monteCarlo.data && <MonteCarloResults result={monteCarlo.data} />}
          </div>
        </div>
      </div>
    </div>
  );
}
