"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDuration, formatPercent } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { ClientMetrics } from "@/types/simulation";

export function SimulationSummary({ metrics }: { metrics: Record<string, ClientMetrics> | undefined }) {
  const open = useAppStore((s) => s.summaryOpen);
  const setOpen = useAppStore((s) => s.setSummaryOpen);
  const clientIds = metrics ? Object.keys(metrics) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Сводка расчёта</DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-2 font-medium">Пункт</th>
                <th className="px-2 py-2 text-right font-medium">Доступность</th>
                <th className="px-2 py-2 text-right font-medium">Видимость</th>
                <th className="px-2 py-2 text-right font-medium">Макс. перерыв</th>
                <th className="py-2 pl-2 text-right font-medium">Цель</th>
              </tr>
            </thead>
            <tbody>
              {clientIds.map((id) => {
                const m = metrics![id];
                return (
                  <tr key={id} className="border-b border-border/60">
                    <td className="py-2 pr-2 font-mono font-medium text-foreground">{id}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatPercent(m.availability_percent)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatPercent(m.visibility_percent)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatDuration(m.max_outage_s)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      {m.target_achieved ? (
                        <CheckCircle2 className="ml-auto h-4 w-4 text-status-ok" />
                      ) : (
                        <XCircle className="ml-auto h-4 w-4 text-status-bad" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
