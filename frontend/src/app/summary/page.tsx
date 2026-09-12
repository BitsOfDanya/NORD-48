"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TopBar } from "@/components/layout/top-bar";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { SummaryWorkspace } from "@/components/summary/summary-workspace";

export default function SummaryPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar subtitle="Сводка и инженерное решение" />
      <WorkspaceNav />

      <div className="flex-1 overflow-y-auto bg-workspace">
        <div className="mx-auto max-w-6xl p-4">
          <PageHeader
            title="Сводка"
            description="Итоговое состояние конфигурации: доступность, устойчивость к отказам и инженерная рекомендация."
          />
          <div className="mt-4">
            <SummaryWorkspace />
          </div>
        </div>
      </div>
    </div>
  );
}
