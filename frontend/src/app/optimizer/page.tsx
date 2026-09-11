"use client";

import { AboutDialog } from "@/components/layout/about-dialog";
import { BackendStatus } from "@/components/layout/backend-status";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { DeploymentPlannerPanel } from "@/components/optimizer/deployment-planner-panel";
import { OptimizerWorkspace } from "@/components/optimizer/optimizer-workspace";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/app-store";

export default function OptimizerPage() {
  const scenarioId = useAppStore((state) => state.selectedScenarioId);
  const tab = useAppStore((state) => state.optimizerTab);
  const setTab = useAppStore((state) => state.setOptimizerTab);

  return (
    <div className="min-h-screen bg-workspace">
      <div className="border-b border-border bg-background">
        <header className="flex h-16 items-center gap-4 px-4">
          <div>
            <h1 className="text-[15px] font-semibold">NORD-48</h1>
            <p className="text-[11px] text-muted-foreground">Configuration Design</p>
          </div>
          <AboutDialog />
          <div className="ml-auto"><BackendStatus /></div>
        </header>
      </div>
      <WorkspaceNav />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
        <div>
          <h2 className="text-xl font-semibold">Оптимизация конфигурации</h2>
          <p className="text-sm text-muted-foreground">
            Поиск параметров орбитальных плоскостей и состава группировки для повышения
            доступности и устойчивости сети.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "search" | "deployment")}>
          <TabsList>
            <TabsTrigger value="search">Поиск RAAN/phase</TabsTrigger>
            <TabsTrigger value="deployment">План развёртывания</TabsTrigger>
          </TabsList>
          <TabsContent value="search">
            <OptimizerWorkspace />
          </TabsContent>
          <TabsContent value="deployment">
            <DeploymentPlannerPanel scenarioId={scenarioId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
