import { BackendStatus } from "@/components/layout/backend-status";
import { ReadinessCard } from "@/components/layout/readiness-card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">OrbitGuard</h1>
        <p className="text-lg text-muted-foreground">
          Satellite Constellation Design &amp; Resilience Platform
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <BackendStatus />
        <p className="text-sm text-muted-foreground">
          Environment: <span className="font-medium text-foreground">Development</span>
        </p>
      </div>

      <ReadinessCard />
    </main>
  );
}
