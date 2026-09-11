"use client";

import { useEffect, useMemo, useState } from "react";

import { AvailabilityTrack } from "@/components/timeline/availability-track";
import { PlaybackControls } from "@/components/timeline/playback-controls";
import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { TimelineStep } from "@/types/simulation";

const BASE_INTERVAL_MS = 350;

export function Timeline({
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
  const playbackSpeed = useAppStore((s) => s.playbackSpeed);
  const [playing, setPlaying] = useState(false);
  const maxT = Math.max(horizonS - stepS, 0);

  const currentReason = useMemo(() => {
    if (!steps) return null;
    return steps.find((s) => s.t_s === selectedTimeS)?.diagnostic_reason ?? null;
  }, [steps, selectedTimeS]);

  useEffect(() => {
    if (!playing || !steps) return;
    const intervalMs = BASE_INTERVAL_MS / playbackSpeed;
    const id = setInterval(() => {
      const next = useAppStore.getState().selectedTimeS + stepS;
      if (next > maxT) {
        setPlaying(false);
        return;
      }
      setSelectedTimeS(next);
    }, intervalMs);
    return () => clearInterval(id);
  }, [playing, playbackSpeed, stepS, maxT, setSelectedTimeS, steps]);

  const stop = () => setPlaying(false);
  const jump = (t: number) => {
    stop();
    setSelectedTimeS(Math.min(Math.max(t, 0), maxT));
  };

  if (!steps) {
    return (
      <div className="flex h-full items-center px-4 text-xs text-text-muted">
        Временная шкала появится после запуска расчёта.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-4 py-2">
      <div className="flex items-center gap-3">
        <PlaybackControls
          playing={playing}
          onTogglePlay={() => setPlaying((v) => !v)}
          onStepBack={() => jump(selectedTimeS - stepS)}
          onStepForward={() => jump(selectedTimeS + stepS)}
          onJumpStart={() => jump(0)}
          onJumpEnd={() => jump(maxT)}
        />

        <div className="relative flex-1">
          <div className="flex items-center justify-between text-[10px] text-text-muted">
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
            onChange={(e) => jump(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Расчётное время"
          />
        </div>

        <span className="w-14 shrink-0 text-right font-mono text-sm font-medium tabular-nums text-foreground">
          {formatClock(selectedTimeS)}
        </span>
      </div>

      <AvailabilityTrack steps={steps} selectedTimeS={selectedTimeS} onSelect={jump} />

      {currentReason && (
        <p className="text-[11px] text-status-bad">
          {formatClock(selectedTimeS)}: Связь отсутствует · {diagnosticReasonLabel(currentReason)}
        </p>
      )}
    </div>
  );
}
