"use client";

import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock } from "@/lib/format";
import type { TimelineStep } from "@/types/simulation";

export function AvailabilityTrack({
  steps,
  selectedTimeS,
  onSelect,
}: {
  steps: TimelineStep[];
  selectedTimeS: number;
  onSelect: (tS: number) => void;
}) {
  return (
    <svg
      viewBox={`0 0 ${steps.length} 10`}
      preserveAspectRatio="none"
      className="h-3 w-full cursor-pointer rounded-sm"
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
          fill={step.available ? "var(--status-deep-blue)" : "var(--status-bad)"}
          opacity={step.t_s === selectedTimeS ? 1 : 0.65}
          onClick={() => onSelect(step.t_s)}
        >
          <title>
            {formatClock(step.t_s)} —{" "}
            {step.available
              ? "маршрут есть"
              : (diagnosticReasonLabel(step.diagnostic_reason) ?? "маршрут отсутствует")}
          </title>
        </rect>
      ))}
    </svg>
  );
}
