"use client";

import { Play } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { GlobeLegend } from "@/components/constellation/globe-legend";
import { GlobeToolbar } from "@/components/constellation/globe-toolbar";
import { SatelliteInspector } from "@/components/constellation/satellite-inspector";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSatelliteMeta } from "@/hooks/use-satellite-meta";
import { formatClock } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { SimulationRunSummary, SnapshotView } from "@/types/simulation";

const GlobeCanvas = dynamic(
  () => import("@/components/constellation/globe-canvas").then((m) => m.GlobeCanvas),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  }
);

function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export function GlobeView({
  run,
  snapshot,
  scenarioTitle,
  onRun,
  isRunPending,
}: {
  run: SimulationRunSummary | undefined;
  snapshot: SnapshotView | undefined;
  scenarioTitle: string | undefined;
  onRun: () => void;
  isRunPending: boolean;
}) {
  const { ref, size } = useContainerSize();
  const [resetToken, setResetToken] = useState(0);
  const layers = useAppStore((s) => s.layers);
  const earthMode = useAppStore((s) => s.earthMode);
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const selectedSatelliteId = useAppStore((s) => s.selectedSatelliteId);
  const setSelectedSatelliteId = useAppStore((s) => s.setSelectedSatelliteId);
  const focusNorthernSitesToken = useAppStore((s) => s.focusNorthernSitesToken);
  const satelliteMeta = useSatelliteMeta(run);

  const selectedRoute = selectedClientId ? snapshot?.routes[selectedClientId] : undefined;
  const selectedSatellite = snapshot?.satellites.find((s) => s.id === selectedSatelliteId);

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden rounded-xl">
      <GlobeCanvas
        width={size.width}
        height={size.height}
        satellites={snapshot?.satellites ?? []}
        groundSites={snapshot?.ground_sites ?? []}
        edges={snapshot?.edges ?? []}
        selectedClientId={selectedClientId}
        selectedRoute={layers.route ? selectedRoute : undefined}
        resetToken={resetToken}
        focusNorthernSitesToken={focusNorthernSitesToken}
        earthMode={earthMode}
        layers={layers}
        satelliteMeta={satelliteMeta}
        selectedSatelliteId={selectedSatelliteId}
        onSelectSatellite={setSelectedSatelliteId}
      />

      <div className="pointer-events-none absolute inset-0">
        {snapshot && (
          <div className="pointer-events-auto absolute left-3 top-3 rounded-lg border border-border bg-card/85 px-3 py-1.5 backdrop-blur-sm">
            <p className="font-mono text-lg font-semibold leading-tight text-foreground tabular-nums">
              {formatClock(snapshot.t_s)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Шаг {Math.round(snapshot.t_s / (run?.step_s ?? 120)) + 1} / {run?.n_steps ?? 720}
            </p>
          </div>
        )}

        <GlobeToolbar onResetView={() => setResetToken((t) => t + 1)} />
        <GlobeLegend />

        {selectedSatellite && (
          <SatelliteInspector
            satellite={selectedSatellite}
            meta={satelliteMeta.get(selectedSatellite.id)}
            edges={snapshot?.edges ?? []}
            tS={snapshot?.t_s ?? 0}
            inRoute={selectedRoute?.path.includes(selectedSatellite.id) ?? false}
            onClose={() => setSelectedSatelliteId(null)}
          />
        )}

        {!snapshot && (
          <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card/90 px-4 py-2.5 shadow-xl backdrop-blur-sm">
            <div>
              <p className="text-sm font-medium text-foreground">Сценарий готов к расчёту</p>
              {scenarioTitle && <p className="text-xs text-muted-foreground">{scenarioTitle}</p>}
            </div>
            <Button size="sm" className="gap-1.5" onClick={onRun} disabled={isRunPending}>
              <Play className="h-3.5 w-3.5" />
              Запустить расчёт
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
