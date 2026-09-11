"use client";

import { useHealth } from "@/hooks/use-health";

export function BackendStatus() {
  const { data, isError, isPending } = useHealth();
  const connected = !isPending && !isError && data?.status === "ok";

  const label = isPending ? "checking..." : connected ? "connected" : "disconnected";
  const dotColor = isPending
    ? "bg-muted-foreground"
    : connected
      ? "bg-emerald-500"
      : "bg-destructive";

  return (
    <p className="text-sm text-muted-foreground">
      Backend:{" "}
      <span className="inline-flex items-center gap-1.5 align-middle font-medium text-foreground">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden />
        {label}
      </span>
    </p>
  );
}
