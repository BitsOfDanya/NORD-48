"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/page-header";
import { TopBar } from "@/components/layout/top-bar";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { DeploymentPlannerPanel } from "@/components/optimizer/deployment-planner-panel";
import { EconomicsPanel } from "@/components/optimizer/economics-panel";
import { IslSensitivityPanel } from "@/components/optimizer/isl-sensitivity-panel";
import { OptimizerWorkspace } from "@/components/optimizer/optimizer-workspace";
import { ThresholdVerificationPanel } from "@/components/optimizer/threshold-verification-panel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getExample } from "@/lib/api/scenarios";
import { useAppStore, type OptimizerTab } from "@/store/app-store";

export default function OptimizerPage() {
  const scenarioId = useAppStore((state) => state.selectedScenarioId);
  const uploadedScenario = useAppStore((state) => state.uploadedScenario);
  const tab = useAppStore((state) => state.optimizerTab);
  const setTab = useAppStore((state) => state.setOptimizerTab);
  const { data: exampleScenario, error: scenarioError, refetch } = useQuery({
    queryKey: ["optimizer-page-scenario", scenarioId],
    queryFn: () => getExample(scenarioId),
    enabled: !uploadedScenario,
  });
  const scenario = uploadedScenario ?? exampleScenario;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar subtitle="Оптимизация конфигурации" />
      <WorkspaceNav />
      <div className="flex-1 overflow-y-auto bg-workspace lg:ml-60">
      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <PageHeader
          title="Оптимизация конфигурации"
          description="Подберите геометрию и состав группировки, затем проверьте дальность межспутниковой связи, ресурсный план и экономику."
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as OptimizerTab)}>
          <TabsList>
            <TabsTrigger value="search">Геометрия орбит</TabsTrigger>
            <TabsTrigger value="deployment">План развёртывания</TabsTrigger>
            <TabsTrigger value="threshold">Порог размера</TabsTrigger>
            <TabsTrigger value="isl">Межспутниковая связь</TabsTrigger>
            <TabsTrigger value="economics">Ресурсы и экономика</TabsTrigger>
          </TabsList>
          <TabsContent value="search">
            <OptimizerWorkspace />
          </TabsContent>
          <TabsContent value="deployment">
            <DeploymentPlannerPanel scenarioId={scenarioId} />
          </TabsContent>
          <TabsContent value="threshold">
            <ThresholdVerificationPanel scenarioId={scenarioId} />
          </TabsContent>
          <TabsContent value="isl">
            <IslSensitivityPanel scenarioId={scenarioId} />
          </TabsContent>
          <TabsContent value="economics">
            {scenario ? (
              <EconomicsPanel key={JSON.stringify([scenario.meta.id, scenario.design])} scenario={scenario} />
            ) : scenarioError ? (
              <div className="flex flex-col gap-3">
                <p role="alert" className="text-sm text-status-bad">Не удалось загрузить сценарий для расчёта ресурсов.</p>
                <Button variant="outline" onClick={() => void refetch()}>Повторить загрузку</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Загружаем параметры сценария…</p>
            )}
          </TabsContent>
        </Tabs>
      </main>
      </div>
    </div>
  );
}
