/**
 * Shared progress display for async jobs (optimizer/deployment-plan/
 * threshold-verification) — real evaluated/total from the backend, never
 * an invented ETA. Frontend-only: just the one progress bar markup that
 * used to be copy-pasted per panel.
 */
export function JobProgress({
  primaryLabel,
  secondaryLabel,
  evaluated,
  total,
}: {
  primaryLabel: string;
  secondaryLabel?: string;
  evaluated: number;
  total: number;
}) {
  const percent = total ? Math.min(100, (evaluated / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{primaryLabel}</span>
        {secondaryLabel && <span className="font-mono tabular-nums">{secondaryLabel}</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
