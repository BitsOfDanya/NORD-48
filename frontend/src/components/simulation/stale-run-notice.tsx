"use client";

import { AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";

export function StaleRunNotice() {
  const notice = useAppStore((state) => state.staleRunNotice);
  const clearNotice = useAppStore((state) => state.clearStaleRunNotice);

  if (!notice) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-status-warn/35 bg-status-warn/10 px-3 py-2 text-sm text-foreground"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" />
      <p className="flex-1">{notice}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        aria-label="Закрыть уведомление"
        onClick={clearNotice}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
