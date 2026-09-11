"use client";

import { cn } from "@/lib/utils";
import { useAppStore, type EarthMode } from "@/store/app-store";

const MODES: { id: EarthMode; label: string }[] = [
  { id: "atlas", label: "Атлас" },
  { id: "network", label: "Сеть" },
  { id: "night", label: "Ночь" },
];

export function EarthModeSwitcher() {
  const earthMode = useAppStore((s) => s.earthMode);
  const setEarthMode = useAppStore((s) => s.setEarthMode);

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-secondary/60 p-0.5">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => setEarthMode(mode.id)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            earthMode === mode.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
