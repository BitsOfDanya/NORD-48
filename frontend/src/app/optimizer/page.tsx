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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getExample } from "@/lib/api/scenarios";
import { useAppStore, type OptimizerTab } from "@/store/app-store";

export default function OptimizerPage() {
  const scenarioId = useAppStore((state) => state.selectedScenarioId);
  const tab = useAppStore((state) => state.optimizerTab);
  const setTab = useAppStore((state) => state.setOptimizerTab);
  const { data: scenario } = useQuery({
    queryKey: ["optimizer-page-scenario", scenarioId],
    queryFn: () => getExample(scenarioId),
  });
  const totalSatellites = scenario?.design.satellites.length ?? 48;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar subtitle="Оптимизация конфигурации" />
      <WorkspaceNav />
      <div className="flex-1 overflow-y-auto bg-workspace">
      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
        <PageHeader
          title="Оптимизация конфигурации"
          description="Поиск проектных параметров с точной проверкой расчётным ядром — геометрия, состав группировки, порог размера, дальность ISL, ресурсы."
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as OptimizerTab)}>
          <TabsList>
            <TabsTrigger value="search">Поиск RAAN/phase</TabsTrigger>
            <TabsTrigger value="deployment">План развёртывания</TabsTrigger>
            <TabsTrigger value="threshold">Порог размера</TabsTrigger>
            <TabsTrigger value="isl">Дальность ISL</TabsTrigger>
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
            <EconomicsPanel totalSatellites={totalSatellites} />
          </TabsContent>
        </Tabs>
      </main>
      </div>
    </div>
  );
}
