"use client";

import { ErrorBanner } from "@/components/layout/error-banner";
import { PageHeader } from "@/components/layout/page-header";
import { TopBar } from "@/components/layout/top-bar";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { MonteCarloForm } from "@/components/resilience/monte-carlo-form";
import { MonteCarloResults } from "@/components/resilience/monte-carlo-results";
import { CriticalityAnalysis } from "@/components/resilience/criticality-analysis";
import { FailureLab } from "@/components/resilience/failure-lab";
import { RoutingAnalysis } from "@/components/resilience/routing-analysis";
import { FailureThreshold } from "@/components/resilience/failure-threshold";
import { RedundancyAnalysis } from "@/components/resilience/redundancy-analysis";
import { FailureDegradation } from "@/components/resilience/failure-degradation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonteCarlo } from "@/hooks/use-monte-carlo";
import { useAppStore, type ResilienceMode } from "@/store/app-store";

export default function ResiliencePage() {
  const selectedScenarioId = useAppStore((s) => s.selectedScenarioId);
  const monteCarlo = useMonteCarlo();
  const storedMonteCarloResult = useAppStore((s) => s.resilienceResults.monteCarlo);
  const monteCarloResult = monteCarlo.data ?? storedMonteCarloResult ?? undefined;
  const mode = useAppStore((s) => s.resilienceMode);
  const setMode = useAppStore((s) => s.setResilienceMode);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar subtitle="Анализ устойчивости к отказам" />
      <WorkspaceNav />

      <div className="flex-1 overflow-y-auto bg-workspace lg:ml-60">
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          <PageHeader
            title="Устойчивость к отказам"
            description="Проверьте единичные и парные отказы, вероятностные риски и резерв маршрутов на полном расчётном горизонте."
          />
        </div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as ResilienceMode)} className="mx-auto max-w-6xl p-4 pt-0 sm:px-6">
          <TabsList>
            <TabsTrigger value="failure">Сценарий отказа</TabsTrigger>
            <TabsTrigger value="criticality">Критичность · N-1</TabsTrigger>
            <TabsTrigger value="threshold">Порог · N-2</TabsTrigger>
            <TabsTrigger value="monte-carlo">Случайные отказы</TabsTrigger>
            <TabsTrigger value="routing">Стратегии маршрутов</TabsTrigger>
            <TabsTrigger value="redundancy">Резерв маршрута</TabsTrigger>
            <TabsTrigger value="degradation">Деградация</TabsTrigger>
          </TabsList>
          <TabsContent value="failure">
            <FailureLab defaultScenarioId={selectedScenarioId} />
          </TabsContent>
          <TabsContent value="criticality">
            <CriticalityAnalysis defaultScenarioId={selectedScenarioId} onOpenFailure={() => setMode("failure")} />
          </TabsContent>
          <TabsContent value="threshold">
            <FailureThreshold defaultScenarioId={selectedScenarioId} />
          </TabsContent>
          <TabsContent value="monte-carlo">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="lg:sticky lg:top-4 lg:self-start">
            <MonteCarloForm
              onSubmit={(request) => monteCarlo.mutate(request)}
              isPending={monteCarlo.isPending}
              defaultScenarioId={selectedScenarioId}
            />
          </div>

          <div className="flex flex-col gap-4">
            {monteCarlo.error ? <ErrorBanner error={monteCarlo.error} /> : null}

            {!monteCarloResult && !monteCarlo.isPending && !monteCarlo.error && (
              <p className="pt-8 text-center text-sm text-muted-foreground">
                Настройте параметры и запустите стресс-тест, чтобы увидеть устойчивость
                группировки к случайным отказам спутников.
              </p>
            )}

            {monteCarloResult && <MonteCarloResults result={monteCarloResult} />}
          </div>
          </div>
          </TabsContent>
          <TabsContent value="routing">
            <RoutingAnalysis defaultScenarioId={selectedScenarioId} />
          </TabsContent>
          <TabsContent value="redundancy">
            <RedundancyAnalysis defaultScenarioId={selectedScenarioId} />
          </TabsContent>
          <TabsContent value="degradation">
            <FailureDegradation defaultScenarioId={selectedScenarioId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
