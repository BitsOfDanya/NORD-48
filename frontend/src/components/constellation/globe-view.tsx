"use client";

import { RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClock } from "@/lib/format";
import type { SnapshotView } from "@/types/simulation";

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

function Legend() {
  const items: { color: string; label: string; kind: "dot" | "line" }[] = [
    { color: "#38bdf8", label: "Активный аппарат", kind: "dot" },
    { color: "#4b5768", label: "Недоступный аппарат", kind: "dot" },
    { color: "#f59e0b", label: "Наземный пункт", kind: "dot" },
    { color: "#22c55e", label: "Шлюз", kind: "dot" },
    { color: "rgba(56,189,248,0.6)", label: "Межспутниковая связь", kind: "line" },
    { color: "#fbbf24", label: "Текущий маршрут", kind: "line" },
  ];

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs backdrop-blur-sm">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-muted-foreground">
          {item.kind === "dot" ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
          ) : (
            <span className="h-0.5 w-3 shrink-0" style={{ backgroundColor: item.color }} />
          )}
          {item.label}
        </div>
      ))}
    </div>
  );
}

function TimeIndicator({ tS, stepIndex, nSteps }: { tS: number; stepIndex: number; nSteps: number }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs backdrop-blur-sm">
      <p className="text-muted-foreground">Расчётное время</p>
      <p className="text-lg font-semibold tabular-nums leading-tight">{formatClock(tS)}</p>
      <p className="text-muted-foreground">
        Шаг {stepIndex + 1} / {nSteps}
      </p>
    </div>
  );
}

export function GlobeView({
  snapshot,
  selectedClientId,
  stepS,
  nSteps,
}: {
  snapshot: SnapshotView | undefined;
  selectedClientId: string | null;
  stepS: number;
  nSteps: number;
}) {
  const { ref, size } = useContainerSize();
  const [resetToken, setResetToken] = useState(0);

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {!snapshot ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-sm font-medium text-foreground">
            Выберите сценарий и запустите расчёт.
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Сервис рассчитает положение аппаратов, доступные линии связи и маршруты до шлюза на
            протяжении суток.
          </p>
        </div>
      ) : (
        <>
          <GlobeCanvas
            width={size.width}
            height={size.height}
            satellites={snapshot.satellites}
            groundSites={snapshot.ground_sites}
            edges={snapshot.edges}
            selectedClientId={selectedClientId}
            selectedRoute={selectedClientId ? snapshot.routes[selectedClientId] : undefined}
            resetToken={resetToken}
          />
          <TimeIndicator
            tS={snapshot.t_s}
            stepIndex={Math.round(snapshot.t_s / stepS)}
            nSteps={nSteps}
          />
          <Legend />
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-3 right-3 gap-1.5"
            onClick={() => setResetToken((t) => t + 1)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить вид
          </Button>
        </>
      )}
    </div>
  );
}
