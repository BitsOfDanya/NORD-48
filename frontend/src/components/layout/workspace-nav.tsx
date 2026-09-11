"use client";

const MODES = [
  { id: "simulation", label: "Моделирование", active: true },
  { id: "compare", label: "Сравнение", active: false },
  { id: "resilience", label: "Устойчивость", active: false },
  { id: "optimizer", label: "Оптимизация", active: false },
] as const;

/**
 * Workspace mode strip. Only "Моделирование" is wired up in v0.1 — the
 * rest are visible-but-disabled so the eventual navigation shape is
 * established without linking to pages that don't exist yet (see
 * README "Следующий этап").
 */
export function WorkspaceNav() {
  return (
    <nav className="flex h-8 items-center gap-4 border-b border-border bg-background px-4">
      {MODES.map((mode) => (
        <span
          key={mode.id}
          title={mode.active ? undefined : "Появится на следующем этапе"}
          className={
            mode.active
              ? "text-xs font-medium text-primary"
              : "cursor-not-allowed text-xs text-text-muted"
          }
        >
          {mode.label}
        </span>
      ))}
    </nav>
  );
}
