import { AboutDialog } from "@/components/layout/about-dialog";
import { BackendStatus } from "@/components/layout/backend-status";

/** App-chrome bar shared by every page except Simulation (which has its
 * own richer header with scenario/strategy pickers and run controls). */
export function TopBar({ subtitle }: { subtitle: string }) {
  return (
    <div className="border-b border-border bg-background">
      <header className="flex h-16 items-center gap-4 px-4">
        <div className="flex flex-col leading-tight">
          <h1 className="text-[15px] font-semibold tracking-wide text-foreground">NORD-48</h1>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <AboutDialog />
        <div className="ml-auto">
          <BackendStatus />
        </div>
      </header>
    </div>
  );
}
