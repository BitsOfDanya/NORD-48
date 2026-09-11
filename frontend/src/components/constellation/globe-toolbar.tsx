"use client";

import { Layers, RotateCcw } from "lucide-react";
import { useState } from "react";

import { EarthModeSwitcher } from "@/components/constellation/earth-mode-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore, type VisualizationLayers } from "@/store/app-store";

const LAYER_TOGGLES: { key: keyof VisualizationLayers; label: string }[] = [
  { key: "satellites", label: "Спутники" },
  { key: "isl", label: "ISL" },
  { key: "groundLinks", label: "Наземные линии" },
  { key: "route", label: "Маршрут" },
  { key: "orbitPlanes", label: "Орбитальные плоскости" },
  { key: "showInactive", label: "Недоступные" },
];

function LayerToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary/60"
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
          active ? "border-primary bg-primary" : "border-muted-foreground/50 bg-transparent"
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-[1px] bg-primary-foreground" />}
      </span>
      {label}
    </button>
  );
}

export function GlobeToolbar({ onResetView }: { onResetView: () => void }) {
  const layers = useAppStore((s) => s.layers);
  const toggleLayer = useAppStore((s) => s.toggleLayer);
  const [layersOpen, setLayersOpen] = useState(false);

  return (
    <div className="pointer-events-auto absolute right-3 top-3 flex items-start gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
        <EarthModeSwitcher />

        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setLayersOpen((v) => !v)}
          >
            <Layers className="h-3.5 w-3.5" />
            Слои
          </Button>
          {layersOpen && (
            <div className="absolute right-0 top-9 z-10 w-52 rounded-lg border border-border bg-card p-1.5 shadow-xl">
              {LAYER_TOGGLES.map((toggle) => (
                <LayerToggle
                  key={toggle.key}
                  label={toggle.label}
                  active={layers[toggle.key]}
                  onClick={() => toggleLayer(toggle.key)}
                />
              ))}
            </div>
          )}
        </div>

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onResetView} title="Сбросить вид">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
