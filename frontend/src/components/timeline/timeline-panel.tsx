"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { TimelineStep } from "@/types/simulation";

const PLAYBACK_INTERVAL_MS = 350;

export function TimelinePanel({
  steps,
  horizonS,
  stepS,
}: {
  steps: TimelineStep[] | undefined;
  horizonS: number;
  stepS: number;
}) {
  const selectedTimeS = useAppStore((s) => s.selectedTimeS);
  const setSelectedTimeS = useAppStore((s) => s.setSelectedTimeS);
  const [playing, setPlaying] = useState(false);
  const maxT = Math.max(horizonS - stepS, 0);

  const currentReason = useMemo(() => {
    if (!steps) return null;
    return steps.find((s) => s.t_s === selectedTimeS)?.diagnostic_reason ?? null;
  }, [steps, selectedTimeS]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = useAppStore.getState().selectedTimeS + stepS;
      if (next > maxT) {
        setPlaying(false);
        return;
      }
      setSelectedTimeS(next);
    }, PLAYBACK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, stepS, maxT, setSelectedTimeS]);

  const stepBack = () => setSelectedTimeS(Math.max(selectedTimeS - stepS, 0));
  const stepForward = () => setSelectedTimeS(Math.min(selectedTimeS + stepS, maxT));

  return (
    <div className="flex flex-col gap-1.5 border-t border-border bg-sidebar px-4 py-2.5">
      <div className="flex items-center gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Временная шкала
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={stepBack} title="Шаг назад">
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setPlaying((v) => !v)}
            title={playing ? "Пауза" : "Воспроизвести"}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={stepForward}
            title="Шаг вперёд"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>
        <span className="ml-auto font-mono text-sm font-medium tabular-nums text-foreground">
          {formatClock(selectedTimeS)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>

      <input
        type="range"
        min={0}
        max={maxT}
        step={stepS}
        value={selectedTimeS}
        onChange={(e) => {
          setPlaying(false);
          setSelectedTimeS(Number(e.target.value));
        }}
        className="w-full accent-primary"
        aria-label="Расчётное время"
      />

      {steps && steps.length > 0 && (
        <svg
          viewBox={`0 0 ${steps.length} 10`}
          preserveAspectRatio="none"
          className="h-3.5 w-full cursor-pointer rounded"
          role="img"
          aria-label="Доступность связи по времени"
        >
          {steps.map((step, i) => (
            <rect
              key={step.t_s}
              x={i}
              y={0}
              width={1}
              height={10}
              fill={step.available ? "var(--status-ok)" : "var(--status-bad)"}
              opacity={step.t_s === selectedTimeS ? 1 : 0.7}
              onClick={() => {
                setPlaying(false);
                setSelectedTimeS(step.t_s);
              }}
            >
              <title>
                {formatClock(step.t_s)} —{" "}
                {step.available ? "маршрут есть" : diagnosticReasonLabel(step.diagnostic_reason) ?? "маршрут отсутствует"}
              </title>
            </rect>
          ))}
        </svg>
      )}

      {currentReason && (
        <p className="text-xs text-status-bad">
          {formatClock(selectedTimeS)}: {diagnosticReasonLabel(currentReason)}
        </p>
      )}
    </div>
  );
}
