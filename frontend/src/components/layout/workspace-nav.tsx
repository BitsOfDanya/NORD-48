"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

type NavItem =
  | { id: "simulation"; label: string; href: "/" }
  | { id: "summary"; label: string; kind: "summary" }
  | { id: "compare"; label: string; disabled: true }
  | { id: "resilience"; label: string; href: "/resilience" }
  | { id: "optimizer"; label: string; href: "/optimizer" };

const ITEMS: NavItem[] = [
  { id: "simulation", label: "Моделирование", href: "/" },
  { id: "summary", label: "Сводка", kind: "summary" },
  { id: "compare", label: "Сравнение", disabled: true },
  { id: "resilience", label: "Устойчивость", href: "/resilience" },
  { id: "optimizer", label: "Оптимизация", href: "/optimizer" },
];

/**
 * Workspace mode strip. "Моделирование" and "Устойчивость" are real
 * routes; "Сводка" jumps to the modelling page and opens the summary
 * dialog there (the dialog itself only mounts on that page). "Сравнение"
 * "Сравнение" remains visible-but-disabled because it is developed separately.
 */
export function WorkspaceNav() {
  const pathname = usePathname();
  const router = useRouter();
  const setSummaryOpen = useAppStore((s) => s.setSummaryOpen);

  const openSummary = () => {
    setSummaryOpen(true);
    if (pathname !== "/") router.push("/");
  };

  return (
    <nav className="flex h-8 items-center gap-4 border-b border-border bg-background px-4">
      {ITEMS.map((item) => {
        if ("disabled" in item) {
          return (
            <span
              key={item.id}
              title="Появится на следующем этапе"
              className="cursor-not-allowed text-xs text-text-muted"
            >
              {item.label}
            </span>
          );
        }
        if ("kind" in item) {
          return (
            <button
              key={item.id}
              type="button"
              onClick={openSummary}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </button>
          );
        }
        const active = pathname === item.href;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "text-xs font-medium",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
