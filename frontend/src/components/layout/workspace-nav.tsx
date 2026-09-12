"use client";

import {
  BarChart3,
  FlaskConical,
  GitCompareArrows,
  Orbit,
  Radar,
  Satellite,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AboutDialog } from "@/components/layout/about-dialog";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    id: "simulation",
    label: "Моделирование",
    description: "Сценарий и маршруты",
    href: "/",
    icon: Orbit,
  },
  {
    id: "summary",
    label: "Инженерная сводка",
    description: "Итоги и решение",
    href: "/summary",
    icon: BarChart3,
  },
  {
    id: "compare",
    label: "Сравнение",
    description: "Варианты относительно базы",
    href: "/compare",
    icon: GitCompareArrows,
  },
  {
    id: "resilience",
    label: "Отказоустойчивость",
    description: "N-1, N-2 и Monte Carlo",
    href: "/resilience",
    icon: ShieldCheck,
  },
  {
    id: "optimizer",
    label: "Оптимизация",
    description: "Поиск конфигурации",
    href: "/optimizer",
    icon: Sparkles,
  },
] as const;

export function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-[73px] items-center gap-3 border-b border-sidebar-border px-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_28%,transparent)]">
            <Satellite className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-extrabold tracking-tight">
              <span className="text-primary">NORD</span>-48
            </p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
              Constellation Lab
            </p>
          </div>
        </div>

        <div className="px-4 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Рабочее пространство
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-14 items-center gap-3 rounded-lg px-3 py-2 outline-none transition-all",
                  "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--sidebar-primary)_22%,transparent)]"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                {active && <span className="absolute -left-3 h-8 w-1 rounded-r-full bg-sidebar-primary" />}
                <Icon className={cn("size-[18px] shrink-0", !active && "text-text-muted group-hover:text-primary")} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{item.label}</span>
                  <span className={cn("block truncate text-[10px]", active ? "text-white/75" : "text-text-muted")}>
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="m-3 rounded-xl border border-sidebar-border bg-secondary/55 p-2">
          <div className="mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            <Radar className="size-3.5" /> Система
          </div>
          <AboutDialog compact />
          <Button
            asChild
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 text-sidebar-foreground",
              pathname === "/research" && "text-primary"
            )}
          >
            <Link href="/research" aria-current={pathname === "/research" ? "page" : undefined}>
              <FlaskConical /> Research
            </Link>
          </Button>
          <ThemeToggle showLabel />
        </div>
        <p className="pb-4 text-center text-[10px] text-text-muted">КосмоХакатон 2026 · 5bit</p>
      </aside>

      <nav className="flex h-12 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border bg-background px-2 lg:hidden">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-2.5 text-xs font-semibold outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
              {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
