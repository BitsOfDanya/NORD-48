"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TopBar } from "@/components/layout/top-bar";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { ComparisonWorkspace } from "@/components/comparison/comparison-workspace";

export default function ComparePage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar subtitle="Сравнение вариантов" />
      <WorkspaceNav />

      <div className="flex-1 overflow-y-auto bg-workspace">
        <div className="mx-auto max-w-6xl p-4">
          <PageHeader
            title="Сравнение вариантов"
            description="2–10 завершённых расчётов относительно явно выбранного baseline."
            showContext={false}
          />
          <div className="mt-4">
            <ComparisonWorkspace />
          </div>
        </div>
      </div>
    </div>
  );
}
