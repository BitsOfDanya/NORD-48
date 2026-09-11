"use client";

import { Loader2 } from "lucide-react";

export function SimulationStatus({
  pending,
  horizonS,
  stepS,
}: {
  pending: boolean;
  horizonS?: number;
  stepS?: number;
}) {
  if (!pending) return null;

  const nSteps = horizonS && stepS ? Math.round(horizonS / stepS) : undefined;

  return (
    <div className="flex items-center gap-2 px-4 pb-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>Расчёт сети...</span>
      {nSteps && stepS && (
        <span className="text-text-muted">
          {nSteps} состояний · шаг {stepS} с
        </span>
      )}
    </div>
  );
}
