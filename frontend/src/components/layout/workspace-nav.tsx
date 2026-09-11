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
    <nav className="flex h-8 items-center gap-4 border-b border-border bg-background px-4">
      {ITEMS.map((item) => {
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
