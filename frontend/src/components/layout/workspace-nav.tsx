"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { id: "simulation", label: "Моделирование", href: "/" },
  { id: "summary", label: "Сводка", href: "/summary" },
  { id: "compare", label: "Сравнение", href: "/compare" },
  { id: "resilience", label: "Устойчивость", href: "/resilience" },
  { id: "optimizer", label: "Оптимизация", href: "/optimizer" },
] as const;

/** Workspace mode strip — every item is a real route. */
export function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-9 items-stretch gap-1 border-b border-border bg-background px-3">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center px-2.5 text-xs font-medium outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            {item.label}
            {active && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
