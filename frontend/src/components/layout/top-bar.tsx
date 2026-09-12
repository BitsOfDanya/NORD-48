import { AboutDialog } from "@/components/layout/about-dialog";
import { BackendStatus } from "@/components/layout/backend-status";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** App-chrome bar shared by every page except Simulation (which has its
 * own richer header with scenario/strategy pickers and run controls). */
export function TopBar({ subtitle }: { subtitle: string }) {
  return (
    <div className="app-topbar border-b border-border bg-background lg:ml-60">
      <header className="flex h-[73px] items-center gap-4 px-4 sm:px-6">
        <div className="flex flex-col leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary lg:hidden">NORD-48</p>
          <h1 className="text-[17px] font-bold tracking-tight text-foreground">{subtitle}</h1>
          <p className="hidden text-[11px] text-muted-foreground sm:block">Инженерная платформа спутниковых группировок</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block"><AboutDialog /></div>
          <BackendStatus />
          <div className="lg:hidden"><ThemeToggle /></div>
        </div>
      </header>
    </div>
  );
}
